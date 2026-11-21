// Dispositivos del navegador que puede usar una Part (`needs.device`: camera, microphone,
// geolocation). GraftMount publica los declarados; los primitivos del SDK que abren un dispositivo
// (BarcodeScanner) lo consultan y no lo abren si la Part no lo declaró.
//
// Alcance honesto: es una barrera de los primitivos del SDK. Una Part de confianza del mismo realm
// podría llamar `getUserMedia` directamente; la garantía fuerte es el iframe sandbox del nivel
// marketplace (atributo `allow`), RFC 0005 §9.
import { createContext, useContext } from 'react'

export type LoomDevice = 'camera' | 'microphone' | 'geolocation'

/** null = no estamos dentro de un injerto (código del host): todo permitido. */
export const GraftDeviceContext = createContext<readonly string[] | null>(null)

export function useDeviceAllowed(device: LoomDevice): boolean {
    const allowed = useContext(GraftDeviceContext)
    return allowed === null || allowed.includes(device)
}
