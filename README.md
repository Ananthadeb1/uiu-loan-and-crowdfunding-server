# ⚙️ UIU PeerFund Server

Node.js / Express backend server powering the **UIU PeerFund Platform**.

## 🛠️ Tech Stack & Key Modules
* **Express 5**: REST API framework
* **MongoDB Native Driver**: Database operations for users, loan requests, crowdfunding, and offers
* **Firebase Admin SDK (`firebase-admin`)**: Direct Firebase Auth management and synchronous account deletion
* **JSONWebToken (`jsonwebtoken`)**: Secure JWT token generation and verification
* **Multer**: File uploads for user profile pictures with type and size validation

## 🔑 Key API Endpoints
* `POST /jwt` — Issue JWT token upon Firebase authentication.
* `GET /users`, `GET /users/:email` — Retrieve user profile data.
* `POST /users`, `PATCH /users/:email`, `PATCH /users/admin/:id` — User registration, profile updates, and admin role promotion.
* `DELETE /users/:id` — Purge user from **MongoDB** AND **Firebase Auth** via Firebase Admin SDK.
* `GET /loanRequest`, `POST /api/loans`, `PATCH /loanRequest/:id` — Loan request management and admin approval.
* `GET /fundraise`, `POST /fundraise`, `PATCH /fundraise/:id` — Crowdfunding campaigns and status updates.
* `GET /api/offers`, `POST /api/offers` — Peer-to-peer loan bidding offers.

## 🚀 Server Run Commands
```bash
npm install
npm run dev
```
