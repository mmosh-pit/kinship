# 🚀 MCP Solana Tool

A powerful MCP (Model Context Protocol) tool built using Node.js for simulating and executing the below tools:

- transferToken

---

## 📦 Prerequisites
Before you begin, ensure you have met the following requirements:
- **Node.js**: v22.17.0 or higher
- **npm**: v10.5.0 or higher (comes with Node.js)
- **Basic understanding**: Of Solana blockchain and token operations

---

## 🛠️ Installation
---

### 1. Go to the root directory and Install dependencies

```npm install -g pnpm```  <br />
```npm install -g ts-node typescript``` <br />
```pnpm install``` <br />

### 2. Environment setup
Create a .env file in the root and update the following things:
   ```bash
   NETWORK= devnet | testnet | mainnet-beta: The default value is devnet.
   PORT=8080
   NEXT_PUBLIC_BACKEND_URL= mmosh-backend URL
   MONGO_URI= MongoDB URL for getting token details
   DATABASE_NAME= 
   ```

---

### 3. Start

```npm start``` <br />
```curl -X GET "http://localhost:8080/get-session-id"``` <br />

---

### 1. transferToken

The transferToken method is used to transfer registered tokens between accounts. Make sure the token details are available in the database; otherwise, the tool will not work.

#### Connect to the server via the client with the authorisation token in the header.

#### Request data types

| Parameter  | Type     | Description                                    |
| :--------- | :------- | :--------------------------------------------- |
| `receiver` | `string` | Receiver public key **Required**               |
| `supply`   | `number` | supply to transfer example: 0.001 **Required** |
| `token`    | `string` | Token name example: MMOSH, and it supports only registered tokens. **Required**         |

#### Response

```response
content: [
  {
    text: "2nxUisPgZUa8wLU2GT1zQDYv2Qd4nfBvacVps6wkswdppQssvyo7NXFrbdGBCVXv9uKPK6yYRxneHRBJTdzBGAAg",
    type: "text"
  }
]
```

#### Response data types

| Parameter | Type             | Description                        |
| :-------- | :--------------- | :--------------------------------- |
| `content` | `Array`          | Result for the transaction         |