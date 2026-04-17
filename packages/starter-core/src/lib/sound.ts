export function playNotificationSound() {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContext) return

        const ctx = new AudioContext()

        // Create an oscillator
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        // Connect oscillator to gain to destination
        osc.connect(gain)
        gain.connect(ctx.destination)

        // Set parameters for a pleasant "ding"
        // Use a sine wave for a smooth tone
        osc.type = 'sine'
        // Start at 880Hz (A5) and drop slightly to 
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.5)

        // Envelope for the sound (fade out)
        gain.gain.setValueAtTime(0.1, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

        // Play
        osc.start(ctx.currentTime)
        osc.stop(ctx.currentTime + 0.5)
    } catch (e) {
        console.error('Error playing notification sound:', e)
    }
}
