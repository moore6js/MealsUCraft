# MealsUCraft

MealsUCraft is a React frontend with a Node.js/Express backend.

## Requirements

- Node.js 18 or later
- npm

## Setup

Install the workspace dependencies from the repository root:

```powershell
npm install
```

## Run locally

Start both the React client and Node server:

```powershell
npm run dev
```

The client runs at `http://localhost:5173` and the API runs at
`http://localhost:3000`.

The sample API health check is available at:

```text
http://localhost:3000/api/health
```

## Build the client

```powershell
npm run build --workspace client
```
