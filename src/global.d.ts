/** Augment the Window interface with app-specific global properties */
interface Window {
  /** Spotify Web Playback SDK state — set by useSpotifySDK.js */
  __spotify?: {
    player: any
    deviceId: string | null
    ready: boolean
  }
  /** Spotify IFrame Embed state — set by useSpotifyEmbed.js */
  __spotifyEmbed?: {
    controller: any
    ready: boolean
    currentTrackId: string | null
    pendingTrackId: string | null
  }
  /** Spotify IFrame API */
  SpotifyIframeApi?: any
  /** Web Audio API (Safari fallback) */
  webkitAudioContext?: typeof AudioContext
  /** Spotify SDK callback */
  onSpotifyWebPlaybackSDKReady?: () => void
}
