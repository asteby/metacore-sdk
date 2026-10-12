import { createContext, useContext, type ReactNode } from 'react'
import { useWebRTCCall } from './hooks/use-webrtc-call'
import { CallOverlay } from './components/call-overlay'
import { IncomingCallBanner } from './components/incoming-call-banner'

type CallApi = ReturnType<typeof useWebRTCCall>

const CallContext = createContext<CallApi | null>(null)

export function CallProvider({ children }: { children: ReactNode }) {
  const api = useWebRTCCall()
  return (
    <CallContext.Provider value={api}>
      {children}
      {api.incoming && (
        <IncomingCallBanner
          name={api.incoming.fromName}
          kind={api.incoming.kind}
          connecting={api.connecting}
          ring={api.incoming.status !== 'active'}
          onAccept={() => void api.acceptIncoming()}
          onDecline={api.declineIncoming}
        />
      )}
      {api.session && (
        <CallOverlay
          title={api.session.title}
          subtitle={api.session.subtitle}
          kind={api.session.kind}
          localStream={api.localStream}
          remotes={api.remotes}
          muted={api.muted}
          camOff={api.camOff}
          linkHint={api.linkHint}
          onToggleMute={api.toggleMute}
          onToggleCam={api.toggleCam}
          onHangup={() => void api.hangup()}
        />
      )}
    </CallContext.Provider>
  )
}

export function useCall() {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used within CallProvider')
  return ctx
}
