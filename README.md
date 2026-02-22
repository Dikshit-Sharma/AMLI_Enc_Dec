# AES Encryption Tool - Frontend-Only Project

This project provides a web-based tool to encrypt and decrypt text using the **AES/GCM/NoPadding** algorithm, implemented entirely in the browser using the Web Crypto API.

## Features
- **Frontend**: React (Vite) with a modern, responsive UI.
- **Client-Side Security**: All encryption and decryption happen locally in your browser. No data is sent to a server.
- **Algorithm**: AES-256 GCM encryption with random 12-byte IV prepended to the ciphertext.

---

## 🚀 How to Run

### Frontend (React)
1. Open a terminal and navigate to the `frontend` folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

---

## 🔐 Encryption Logic Details
- **Algorithm**: `AES/GCM/NoPadding` (Web Crypto `AES-GCM`)
- **IV Length**: 12 bytes (Generated randomly for each encryption)
- **Tag Length**: 16 bytes (128 bits)
- **Output Format**: `Base64(IV + CipherText)`

---

## 🧪 Testing with Sample Key
You can use the following Base64 encoded 256-bit key for testing:
`MloxSkdQSGJuY1I3Mm1BVFlhenFsOGpsZDZBbEFMclg=`

1.  **Encrypt**: Enter plain text and the key -> Get Base64 result.
2.  **Decrypt**: Paste the encrypted Base64 result back and use the same key -> Get original text.
