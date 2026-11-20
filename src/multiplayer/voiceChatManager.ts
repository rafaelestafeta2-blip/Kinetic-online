import { soundEngine } from '../audio/soundEngine';
import { getCloudSyncState } from '../firebase/playerCloudSync';
import { getPlayerInventoryState } from '../progression/loadoutSystem';
import { WarfaceClassId } from '../types/game';
import {
  getActiveOnlineRoom,
  getLocalEffectiveUid,
  registerVoiceWireHandler,
  sendRawWsMessage,
  subscribeOnlineRoom,
} from './onlineRoomService';
import { OnlineRoomState, OnlineTeam } from './onlineTypes';

export type VoiceMicMode = 'MUTED' | 'PTT' | 'OPEN';

export interface VoicePeerState {
  uid: string;
  callsign: string;
  team: OnlineTeam;
  classId: WarfaceClassId;
  micMode: VoiceMicMode;
  isSpeaking: boolean;
  audioLevel: number; // 0..1
  mutedByLocal: boolean;
  connected: boolean;
  lastCallout?: string;
  lastCalloutAtMs?: number;
}

export interface TacticalCalloutBanner {
  id: string;
  senderUid: string;
  senderCallsign: string;
  senderClassId: WarfaceClassId;
  text: string;
  ts: number;
}

export interface VoiceChatState {
  micMode: VoiceMicMode;
  pttHeld: boolean;
  isTransmitting: boolean;
  localAudioLevel: number;
  teamChannelMuted: boolean;
  micPermissionError: string | null;
  frequencyMhz: string;
  peers: Record<string, VoicePeerState>;
  recentCallout: TacticalCalloutBanner | null;
}

export const TACTICAL_QUICK_CALLOUTS: Array<{
  id: string;
  code: string;
  label: string;
  radioText: string;
}> = [
  {
    id: 'CLEAR_A',
    code: 'F1',
    label: 'AVANÇAR BOMBA A',
    radioText: 'Avançando para o Ponto A! Cubram a entrada!',
  },
  {
    id: 'CLEAR_B',
    code: 'F2',
    label: 'AVANÇAR BOMBA B',
    radioText: 'Rota B livre, entrando no Bomb B agora!',
  },
  {
    id: 'ENEMY_SPOTTED',
    code: 'F3',
    label: 'CONTATO INIMIGO',
    radioText: 'Contato hostil avistado na minha posição!',
  },
  {
    id: 'NEED_BACKUP',
    code: 'F4',
    label: 'PRECISO DE SUPORTE',
    radioText: 'Preciso de reforço imediato e munição/cura!',
  },
  {
    id: 'HOLD_POSITION',
    code: 'F5',
    label: 'SEGURAR POSIÇÃO',
    radioText: 'Segurem o ângulo! Não avancem sozinhos!',
  },
];

const RTC_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

interface PeerConnectionEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  remoteAnalyser?: AnalyserNode;
  remoteData?: Uint8Array<ArrayBuffer>;
  makingOffer: boolean;
}

type VoiceSubscriber = (state: VoiceChatState) => void;

class TacticalVoiceChatManager {
  private subscribers = new Set<VoiceSubscriber>();
  private state: VoiceChatState = {
    micMode: 'PTT',
    pttHeld: false,
    isTransmitting: false,
    localAudioLevel: 0,
    teamChannelMuted: false,
    micPermissionError: null,
    frequencyMhz: '148.55 MHz · VANGUARD',
    peers: {},
    recentCallout: null,
  };

  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localFreqData: Uint8Array<ArrayBuffer> | null = null;
  private peerConnections = new Map<string, PeerConnectionEntry>();
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private currentRoomId: string | null = null;
  private localTeam: OnlineTeam = 'VANGUARD';
  private lastBroadcastSpeaking = false;
  private lastBroadcastAtMs = 0;
  private calloutClearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      registerVoiceWireHandler((msg) => this.handleIncomingWireMessage(msg));
      subscribeOnlineRoom((room) => this.handleRoomUpdate(room));
      this.startVadLoop();
    }
  }

  public getState(): VoiceChatState {
    return {
      ...this.state,
      peers: { ...this.state.peers },
    };
  }

  public subscribe(fn: VoiceSubscriber): () => void {
    this.subscribers.add(fn);
    fn(this.getState());
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private emit(): void {
    const snap = this.getState();
    this.subscribers.forEach((fn) => fn(snap));
  }

  private playRadioClick(highPitch = true): void {
    try {
      soundEngine.playMechanicalSwitch(highPitch ? 1.32 : 0.88);
    } catch {
      // ignore if audio context not unlocked yet
    }
  }

  public async setMicMode(mode: VoiceMicMode): Promise<void> {
    this.state.micPermissionError = null;
    if (mode === 'MUTED') {
      this.state.micMode = 'MUTED';
      this.state.pttHeld = false;
      this.releaseMicrophone();
      this.playRadioClick(false);
      this.broadcastVoiceState(true);
      this.emit();
      return;
    }
    if (mode === 'OPEN' || mode === 'PTT') {
      const ok = await this.ensureMicrophoneStream();
      if (!ok && mode === 'OPEN') {
        this.state.micMode = 'MUTED';
        this.releaseMicrophone();
        this.emit();
        return;
      }
    }
    this.state.micMode = mode;
    if (mode !== 'PTT') {
      this.state.pttHeld = false;
    }
    this.playRadioClick(true);
    this.updateLocalTrackEnabled();
    this.broadcastVoiceState(true);
    this.emit();
  }

  public async setPttHeld(held: boolean): Promise<void> {
    if (this.state.pttHeld === held) return;
    if (held) {
      if (this.state.micMode === 'MUTED') {
        this.state.micMode = 'PTT';
      }
      const ok = await this.ensureMicrophoneStream();
      if (!ok) {
        this.state.pttHeld = false;
        this.updateLocalTrackEnabled();
        this.emit();
        return;
      }
    }
    this.state.pttHeld = held;
    this.playRadioClick(held);
    this.updateLocalTrackEnabled();
    this.broadcastVoiceState(true);
    this.emit();
  }

  public toggleTeamChannelMute(): void {
    this.state.teamChannelMuted = !this.state.teamChannelMuted;
    this.playRadioClick(!this.state.teamChannelMuted);
    this.peerConnections.forEach((entry, uid) => {
      const peer = this.state.peers[uid];
      entry.audioEl.muted =
        this.state.teamChannelMuted || Boolean(peer?.mutedByLocal);
    });
    this.emit();
  }

  public togglePeerMute(uid: string): void {
    const peer = this.state.peers[uid];
    if (!peer) return;
    peer.mutedByLocal = !peer.mutedByLocal;
    const entry = this.peerConnections.get(uid);
    if (entry) {
      entry.audioEl.muted = this.state.teamChannelMuted || peer.mutedByLocal;
    }
    this.playRadioClick(!peer.mutedByLocal);
    this.emit();
  }

  public sendQuickCallout(calloutId: string): void {
    const spec = TACTICAL_QUICK_CALLOUTS.find((c) => c.id === calloutId);
    if (!spec) return;
    const localUid = getLocalEffectiveUid();
    const sync = getCloudSyncState();
    const inv = getPlayerInventoryState();
    const callsign = sync.profile.callsign || 'OPERADOR';
    const classId = inv.selectedClass || 'FUZILEIRO';

    this.playRadioClick(true);
    this.showCalloutBanner({
      id: `call_${Date.now()}`,
      senderUid: localUid,
      senderCallsign: callsign,
      senderClassId: classId,
      text: spec.radioText,
      ts: Date.now(),
    });

    sendRawWsMessage({
      type: 'VOICE_STATE',
      micMode: this.state.micMode,
      isSpeaking: true,
      audioLevel: 0.85,
      callsign,
      classId,
      team: this.localTeam,
      quickCallout: spec.radioText,
      ts: Date.now(),
    });
  }

  private showCalloutBanner(banner: TacticalCalloutBanner): void {
    this.state.recentCallout = banner;
    if (this.calloutClearTimer) {
      clearTimeout(this.calloutClearTimer);
    }
    this.calloutClearTimer = setTimeout(() => {
      this.state.recentCallout = null;
      this.emit();
    }, 4500);
    this.emit();
  }

  private async ensureMicrophoneStream(): Promise<boolean> {
    if (this.localStream && this.localStream.active) {
      return true;
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      this.state.micPermissionError =
        'Microfone não suportado neste navegador/dispositivo.';
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      this.localStream = stream;
      this.state.micPermissionError = null;
      this.setupLocalAudioGraph(stream);
      this.updateLocalTrackEnabled();

      // Attach stream tracks to any existing peer connections
      this.peerConnections.forEach((entry) => {
        const senders = entry.pc.getSenders();
        stream.getAudioTracks().forEach((track) => {
          const existing = senders.find((s) => s.track?.kind === 'audio');
          if (existing) {
            void existing.replaceTrack(track);
          } else {
            entry.pc.addTrack(track, stream);
          }
        });
      });

      return true;
    } catch {
      this.state.micPermissionError =
        'Permissão de microfone negada. Ative o microfone no navegador para falar no rádio.';
      return false;
    }
  }

  private setupLocalAudioGraph(stream: MediaStream): void {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtx();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
      const source = this.audioCtx.createMediaStreamSource(stream);
      // Band-pass tactical radio clarity filter for local VAD analysis
      const highpass = this.audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 180;

      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(highpass);
      highpass.connect(analyser);

      this.localAnalyser = analyser;
      this.localFreqData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // ignore WebAudio graph failure
    }
  }

  private isGateOpen(): boolean {
    if (this.state.micMode === 'OPEN') return true;
    if (this.state.micMode === 'PTT' && this.state.pttHeld) return true;
    return false;
  }

  private updateLocalTrackEnabled(): void {
    const enabled = this.isGateOpen();
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((t) => {
        t.enabled = enabled;
      });
    }
    if (!enabled) {
      this.state.isTransmitting = false;
      this.state.localAudioLevel = 0;
    }
  }

  private startVadLoop(): void {
    if (this.vadTimer) clearInterval(this.vadTimer);
    this.vadTimer = setInterval(() => {
      let uiDirty = false;
      const gateOpen = this.isGateOpen();

      if (gateOpen && this.localAnalyser && this.localFreqData) {
        this.localAnalyser.getByteFrequencyData(this.localFreqData);
        let sum = 0;
        const len = this.localFreqData.length;
        for (let i = 2; i < Math.min(48, len); i++) {
          sum += this.localFreqData[i];
        }
        const avg = sum / Math.max(1, Math.min(46, len - 2));
        const norm = Math.min(1, Math.max(0, (avg - 10) / 85));
        const speaking =
          this.state.micMode === 'PTT'
            ? this.state.pttHeld && norm > 0.03
            : norm > 0.08;

        if (
          Math.abs(this.state.localAudioLevel - norm) > 0.04 ||
          this.state.isTransmitting !== speaking
        ) {
          this.state.localAudioLevel = norm;
          this.state.isTransmitting = speaking;
          uiDirty = true;
        }
      } else if (this.state.isTransmitting || this.state.localAudioLevel > 0) {
        this.state.isTransmitting = false;
        this.state.localAudioLevel = 0;
        uiDirty = true;
      }

      // Sample remote peer analysers so remote waveforms pulse smoothly in real time
      this.peerConnections.forEach((entry, uid) => {
        const peer = this.state.peers[uid];
        if (!peer || !entry.remoteAnalyser || !entry.remoteData) return;
        entry.remoteAnalyser.getByteFrequencyData(entry.remoteData);
        let rSum = 0;
        for (let i = 2; i < Math.min(40, entry.remoteData.length); i++) {
          rSum += entry.remoteData[i];
        }
        const rAvg = rSum / 38;
        const rLevel = Math.min(1, Math.max(0, (rAvg - 8) / 80));
        const rSpeaking = rLevel > 0.06 && !peer.mutedByLocal && !this.state.teamChannelMuted;
        if (
          Math.abs(peer.audioLevel - rLevel) > 0.05 ||
          peer.isSpeaking !== rSpeaking
        ) {
          peer.audioLevel = rLevel;
          peer.isSpeaking = rSpeaking;
          uiDirty = true;
        }
      });

      const now = Date.now();
      if (
        this.currentRoomId &&
        (this.state.isTransmitting !== this.lastBroadcastSpeaking ||
          (this.state.isTransmitting && now - this.lastBroadcastAtMs > 420))
      ) {
        this.broadcastVoiceState(false);
      }

      if (uiDirty) {
        this.emit();
      }
    }, 110);
  }

  private broadcastVoiceState(force: boolean): void {
    if (!this.currentRoomId) return;
    const now = Date.now();
    if (!force && now - this.lastBroadcastAtMs < 180) return;
    this.lastBroadcastSpeaking = this.state.isTransmitting;
    this.lastBroadcastAtMs = now;
    const sync = getCloudSyncState();
    const inv = getPlayerInventoryState();
    sendRawWsMessage({
      type: 'VOICE_STATE',
      micMode: this.state.micMode,
      isSpeaking: this.state.isTransmitting,
      audioLevel: Number(this.state.localAudioLevel.toFixed(2)),
      callsign: sync.profile.callsign || 'OPERADOR',
      classId: inv.selectedClass || 'FUZILEIRO',
      team: this.localTeam,
      ts: now,
    });
  }

  private handleRoomUpdate(room: OnlineRoomState | null): void {
    if (!room) {
      this.cleanupAllPeers();
      this.releaseMicrophone();
      this.currentRoomId = null;
      this.emit();
      return;
    }

    const localUid = getLocalEffectiveUid();
    const me = room.players[localUid];
    const myTeam: OnlineTeam = me?.team || 'VANGUARD';
    this.localTeam = myTeam;
    this.state.frequencyMhz =
      myTeam === 'VANGUARD'
        ? '148.55 MHz · VANGUARD'
        : '162.80 MHz · BLACKTHORN';

    if (this.currentRoomId !== room.roomId) {
      this.cleanupAllPeers();
      this.currentRoomId = room.roomId;
    }

    // Sync teammate roster (only same team!)
    const activeTeammateUids = new Set<string>();
    Object.values(room.players).forEach((p) => {
      if (!p || !p.uid || p.uid === localUid) return;
      if (p.team !== myTeam) return; // Strict team radio isolation
      activeTeammateUids.add(p.uid);
      const existing = this.state.peers[p.uid];
      this.state.peers[p.uid] = {
        uid: p.uid,
        callsign: p.callsign || 'OPERADOR',
        team: p.team,
        classId: p.classId || existing?.classId || 'FUZILEIRO',
        micMode: existing?.micMode || 'PTT',
        isSpeaking: existing?.isSpeaking || false,
        audioLevel: existing?.audioLevel || 0,
        mutedByLocal: existing?.mutedByLocal || false,
        connected: existing?.connected || false,
        lastCallout: existing?.lastCallout,
        lastCalloutAtMs: existing?.lastCalloutAtMs,
      };

      // Deterministic WebRTC Offer initiator: lexicographically smaller UID initiates offer
      if (!this.peerConnections.has(p.uid) && localUid < p.uid) {
        void this.initiatePeerOffer(p.uid);
      }
    });

    // Remove peers that left or switched to enemy team
    Object.keys(this.state.peers).forEach((uid) => {
      if (!activeTeammateUids.has(uid)) {
        this.closePeer(uid);
        delete this.state.peers[uid];
      }
    });

    this.emit();
  }

  private getOrCreatePeerConnection(remoteUid: string): PeerConnectionEntry {
    const existing = this.peerConnections.get(remoteUid);
    if (existing) return existing;

    const pc = new RTCPeerConnection(RTC_ICE_SERVERS);
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');
    audioEl.muted =
      this.state.teamChannelMuted ||
      Boolean(this.state.peers[remoteUid]?.mutedByLocal);

    const entry: PeerConnectionEntry = {
      pc,
      audioEl,
      makingOffer: false,
    };
    this.peerConnections.set(remoteUid, entry);

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendRawWsMessage({
          type: 'VOICE_SIGNAL',
          targetUid: remoteUid,
          signalType: 'ice',
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const peer = this.state.peers[remoteUid];
      if (peer) {
        peer.connected =
          pc.connectionState === 'connected' ||
          pc.iceConnectionState === 'connected';
        this.emit();
      }
    };

    pc.ontrack = (ev) => {
      const [remoteStream] = ev.streams;
      if (!remoteStream) return;
      audioEl.srcObject = remoteStream;
      void audioEl.play().catch(() => {});

      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!this.audioCtx) {
          this.audioCtx = new AudioCtx();
        }
        const source = this.audioCtx.createMediaStreamSource(remoteStream);
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        entry.remoteAnalyser = analyser;
        entry.remoteData = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        // ignore remote analyser error
      }

      const peer = this.state.peers[remoteUid];
      if (peer) {
        peer.connected = true;
        this.emit();
      }
    };

    return entry;
  }

  private async initiatePeerOffer(remoteUid: string): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') return;
    const entry = this.getOrCreatePeerConnection(remoteUid);
    if (entry.makingOffer) return;
    try {
      entry.makingOffer = true;
      const offer = await entry.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await entry.pc.setLocalDescription(offer);
      sendRawWsMessage({
        type: 'VOICE_SIGNAL',
        targetUid: remoteUid,
        signalType: 'offer',
        sdp: entry.pc.localDescription,
      });
    } catch {
      // ignore offer race
    } finally {
      entry.makingOffer = false;
    }
  }

  private async handleIncomingWireMessage(
    msg: Record<string, unknown>
  ): Promise<void> {
    const senderUid =
      typeof msg.senderUid === 'string' ? msg.senderUid : '';
    const localUid = getLocalEffectiveUid();
    if (!senderUid || senderUid === localUid) return;

    const senderTeam: OnlineTeam =
      msg.senderTeam === 'BLACKTHORN' ? 'BLACKTHORN' : 'VANGUARD';
    if (senderTeam !== this.localTeam) return; // Ignore enemy team radio

    const senderCallsign =
      typeof msg.senderCallsign === 'string'
        ? msg.senderCallsign
        : 'OPERADOR';
    const senderClassId =
      (typeof msg.senderClassId === 'string'
        ? msg.senderClassId
        : 'FUZILEIRO') as WarfaceClassId;

    if (!this.state.peers[senderUid]) {
      this.state.peers[senderUid] = {
        uid: senderUid,
        callsign: senderCallsign,
        team: senderTeam,
        classId: senderClassId,
        micMode: 'PTT',
        isSpeaking: false,
        audioLevel: 0,
        mutedByLocal: false,
        connected: false,
      };
    }

    if (msg.type === 'VOICE_STATE') {
      const peer = this.state.peers[senderUid];
      if (peer) {
        peer.callsign = senderCallsign;
        peer.classId = senderClassId;
        peer.micMode =
          msg.micMode === 'OPEN' || msg.micMode === 'PTT'
            ? msg.micMode
            : 'MUTED';
        peer.isSpeaking =
          Boolean(msg.isSpeaking) &&
          !peer.mutedByLocal &&
          !this.state.teamChannelMuted;
        peer.audioLevel = Math.max(
          0,
          Math.min(1, Number(msg.audioLevel) || 0)
        );

        if (
          typeof msg.quickCallout === 'string' &&
          msg.quickCallout.length > 0 &&
          !peer.mutedByLocal &&
          !this.state.teamChannelMuted
        ) {
          peer.lastCallout = msg.quickCallout;
          peer.lastCalloutAtMs = Date.now();
          this.playRadioClick(true);
          this.showCalloutBanner({
            id: `call_${senderUid}_${Date.now()}`,
            senderUid,
            senderCallsign,
            senderClassId,
            text: msg.quickCallout,
            ts: Date.now(),
          });
        }
        this.emit();
      }
      return;
    }

    if (msg.type === 'VOICE_SIGNAL' && typeof RTCPeerConnection !== 'undefined') {
      const entry = this.getOrCreatePeerConnection(senderUid);
      const signalType = msg.signalType;
      try {
        if (signalType === 'offer' && msg.sdp) {
          await entry.pc.setRemoteDescription(
            new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit)
          );
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          sendRawWsMessage({
            type: 'VOICE_SIGNAL',
            targetUid: senderUid,
            signalType: 'answer',
            sdp: entry.pc.localDescription,
          });
        } else if (signalType === 'answer' && msg.sdp) {
          if (entry.pc.signalingState === 'have-local-offer') {
            await entry.pc.setRemoteDescription(
              new RTCSessionDescription(msg.sdp as RTCSessionDescriptionInit)
            );
          }
        } else if (signalType === 'ice' && msg.candidate) {
          await entry.pc.addIceCandidate(
            new RTCIceCandidate(msg.candidate as RTCIceCandidateInit)
          );
        }
      } catch {
        // ignore transient WebRTC negotiation errors
      }
    }
  }

  private closePeer(uid: string): void {
    const entry = this.peerConnections.get(uid);
    if (!entry) return;
    try {
      entry.audioEl.pause();
      entry.audioEl.srcObject = null;
      entry.pc.close();
    } catch {}
    this.peerConnections.delete(uid);
  }

  private restoreNativeMediaAudioMode(): void {
    try {
      const bridge = (
        window as unknown as {
          KineticNativeAuth?: { restoreMediaAudioMode?: () => void };
        }
      ).KineticNativeAuth;
      if (bridge && typeof bridge.restoreMediaAudioMode === 'function') {
        bridge.restoreMediaAudioMode();
      }
    } catch {
      // ignore on web browsers without native bridge
    }
  }

  /**
   * Fully stops the hardware microphone MediaStream and closes the voice AudioContext
   * so Android exits MODE_IN_COMMUNICATION (muffled/low call volume) and restores
   * full stereo media loudspeaker output immediately.
   */
  public releaseMicrophone(): void {
    const hadStream = Boolean(this.localStream);
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track) => {
          track.enabled = false;
          track.stop();
        });
      } catch {
        // ignore stop errors
      }
      this.localStream = null;
    }

    // Detach local track from any open peer senders so WebRTC stops capturing audio
    this.peerConnections.forEach((entry) => {
      try {
        entry.pc.getSenders().forEach((sender) => {
          if (sender.track && sender.track.kind === 'audio') {
            void sender.replaceTrack(null).catch(() => {});
          }
        });
      } catch {
        // ignore
      }
    });

    this.localAnalyser = null;
    this.localFreqData = null;
    this.state.pttHeld = false;
    this.state.isTransmitting = false;
    this.state.localAudioLevel = 0;

    if (this.audioCtx && this.peerConnections.size === 0) {
      try {
        void this.audioCtx.close().catch(() => {});
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }

    if (hadStream || this.peerConnections.size === 0) {
      this.restoreNativeMediaAudioMode();
    }
  }

  /**
   * Called automatically whenever the player exits a match (returns to Main Menu,
   * match victory/defeat, or disconnect). Shuts down mic hardware, closes peers,
   * and restores normal full-volume Android media audio.
   */
  public endMatchVoiceSession(): void {
    const wasActive =
      Boolean(this.localStream) ||
      this.peerConnections.size > 0 ||
      this.state.micMode === 'OPEN' ||
      this.state.pttHeld ||
      this.state.isTransmitting;

    this.cleanupAllPeers();
    if (this.state.micMode === 'OPEN') {
      this.state.micMode = 'PTT';
    }
    this.releaseMicrophone();
    this.restoreNativeMediaAudioMode();
    if (wasActive) {
      this.emit();
    }
  }

  private cleanupAllPeers(): void {
    Array.from(this.peerConnections.keys()).forEach((uid) =>
      this.closePeer(uid)
    );
    this.state.peers = {};
  }
}

export const voiceChatManager = new TacticalVoiceChatManager();

export function getActiveTeamVoiceRoster(): VoicePeerState[] {
  const room = getActiveOnlineRoom();
  const state = voiceChatManager.getState();
  if (!room) return Object.values(state.peers);
  return Object.values(state.peers);
}
