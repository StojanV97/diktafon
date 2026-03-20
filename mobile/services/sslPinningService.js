import { initializeSslPinning } from "react-native-ssl-public-key-pinning"

export async function setupSslPinning() {
  await initializeSslPinning({
    "api.assemblyai.com": {
      includeSubdomains: true,
      certs: [
        // Leaf certificate pin
        "CZeSZU67gkkm38VUyW3BQgsKeDDMhsspi6qsXBGCRRM=",
        // Intermediate CA backup pin
        "18tkPyr2nckv4fgo0dhAkaUtJ2hu2831xlO2SKhq8dg=",
      ],
    },
  })
}
