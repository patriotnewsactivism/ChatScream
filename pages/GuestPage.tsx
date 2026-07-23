import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, CameraOff, Mic, MicOff, PhoneOff, Wifi } from 'lucide-react';
import { GuestClientService } from '../services/webrtcGuestService';

const GuestPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const videoRef = useRef<HTMLVideoElement>(null);
  const guestRef = useRef<GuestClientService | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error' | 'left'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const getStream = async (facing: 'user' | 'environment') => {
    return navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  };

  const join = async () => {
    if (!roomId) return;
    setStatus('connecting');
    try {
      const stream = await getStream(facingMode);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
      }

      const guest = new GuestClientService(roomId, 'Guest');
      guestRef.current = guest;
      await guest.join(stream);
      setStatus('live');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err?.message || 'Failed to connect');
    }
  };

  const leave = () => {
    guestRef.current?.leave();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus('left');
  };

  const toggleMic = () => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = isMuted;
    });
    setIsMuted((m) => !m);
  };

  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = isCamOff;
    });
    setIsCamOff((c) => !c);
  };

  const flipCamera = async () => {
    if (!streamRef.current || status !== 'live') return;
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await getStream(newFacing);
      const [newVideoTrack] = newStream.getVideoTracks();
      const sender = (guestRef.current as any)?.pc
        ?.getSenders()
        ?.find((s: RTCRtpSender) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);

      streamRef.current.getVideoTracks().forEach((t) => t.stop());
      if (videoRef.current) videoRef.current.srcObject = newStream;
      streamRef.current = newStream;
      setFacingMode(newFacing);
    } catch (err) {
      console.error('Camera flip failed:', err);
    }
  };

  useEffect(() => {
    return () => {
      guestRef.current?.leave();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-4">
      {/* Video preview */}
      <div className="w-full max-w-sm aspect-video bg-gray-900 rounded-xl overflow-hidden mb-6 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
        />
        {status === 'live' && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 rounded-full px-3 py-1 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            LIVE
          </div>
        )}
        {isCamOff && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <CameraOff className="text-gray-500" size={48} />
          </div>
        )}
      </div>

      {/* Status */}
      <p className="text-sm text-gray-400 mb-6">
        {status === 'idle' && `Room: ${roomId}`}
        {status === 'connecting' && 'Connecting to streamâ¦'}
        {status === 'live' && 'You are live as a guest camera'}
        {status === 'left' && 'You have left the stream'}
        {status === 'error' && `Error: ${errorMsg}`}
      </p>

      {/* Controls */}
      {status === 'idle' && (
        <button
          onClick={join}
          className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-full text-white font-bold text-lg"
        >
          Join as Camera
        </button>
      )}

      {status === 'live' && (
        <div className="flex items-center gap-4">
          <button
            onClick={toggleMic}
            className={`p-4 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-700'}`}
            title={isMuted ? 'Unmute mic' : 'Mute mic'}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
          <button
            onClick={toggleCam}
            className={`p-4 rounded-full ${isCamOff ? 'bg-red-600' : 'bg-gray-700'}`}
            title={isCamOff ? 'Turn camera on' : 'Turn camera off'}
          >
            {isCamOff ? <CameraOff size={24} /> : <Camera size={24} />}
          </button>
          <button
            onClick={flipCamera}
            className="p-4 rounded-full bg-gray-700"
            title="Flip camera"
          >
            <Wifi size={24} />
          </button>
          <button
            onClick={leave}
            className="p-4 rounded-full bg-red-700 hover:bg-red-600"
            title="Leave stream"
          >
            <PhoneOff size={24} />
          </button>
        </div>
      )}

      {(status === 'left' || status === 'error') && (
        <button
          onClick={() => setStatus('idle')}
          className="px-6 py-2 bg-gray-700 rounded-full text-white"
        >
          Try again
        </button>
      )}

      {status === 'connecting' && (
        <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
};

export default GuestPage;
