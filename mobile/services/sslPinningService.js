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
    "huggingface.co": {
      includeSubdomains: true,
      certs: [
        // Amazon RSA 2048 M02 intermediate (serves huggingface.co)
        "kIdp6NNEd8wsugYyyIYFsi1ylMCED3hZbSR8ZFsa/dc=",
        // Amazon Root CA 1 backup pin
        "++MBgDH5WGvL9Bcn5Be30cRcL0f5O+NyoXuWtQdX1aI=",
      ],
    },
  })
}
