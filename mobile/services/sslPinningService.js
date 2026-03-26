import { initializeSslPinning } from "react-native-ssl-public-key-pinning"

export async function setupSslPinning() {
  await initializeSslPinning({
    "api.together.xyz": {
      includeSubdomains: true,
      certs: [
        // Cloudflare Inc ECC CA-3 intermediate (serves together.xyz)
        "Wf0LI4XTm6a1FBJxMkVWXsGnrKEdEb3m4dj35MlzYRE=",
        // Baltimore CyberTrust Root backup pin
        "Y9mvm0exBk1JoQ57f9Vm28jKo5lFm/woKcVxrYxu80o=",
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
