# MHSkyhub

Dual-interface cabin experience prototype with a passenger infotainment app, a crew dashboard, and a lightweight Express backend for live syncing.

## Apps

- Passenger app: `passenger/`
- Crew app: `crew/`
- Backend API + Socket.io: `backend/`

## Project structure

```text
MHSkyhub/
|- assets/
|  |- branding/
|  |- posters/
|  |  |- movies/
|  |  `- tv/
|  `- widgets/
|- backend/
|  |- db.js
|  |- server.js
|  `- package.json
|- crew/
|  |- css/
|  |- js/
|  |  |- app.js
|  |  `- backend-sync.js
|  `- index.html
|- passenger/
|  |- css/
|  |- js/
|  |  |- app.js
|  |  `- backend-sync.js
|  `- index.html
|- tools/
|- .env
|- .gitignore
|- index.html
`- crew.html
```

## What is live now

- Passenger and crew chat sync through the backend API and Socket.io.
- Passenger service requests are stored in SQLite instead of browser `localStorage`.
- Crew status changes update the passenger tracking screen across separate devices.
- Demo authentication route is available at `POST /api/auth/login` using JWT responses.

## Run locally

1. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
2. Start the backend:
   ```bash
   npm run dev
   ```
3. Open the apps:
   - Passenger: `http://localhost:5000/passenger`
   - Crew: `http://localhost:5000/crew`

## Demo credentials

- Crew: `crew` / `mhcrew123`
- Passenger: `passenger14a` / `mhpass123`

## API summary

- `POST /api/auth/login`
- `GET /api/chat?seat=14A`
- `POST /api/chat`
- `GET /api/chat/threads`
- `GET /api/requests`
- `GET /api/requests?seat=14A`
- `PUT /api/requests/:id`
- `PATCH /api/requests/:id`

## Persistence

- SQLite database file: `backend/data/mhskyhub.sqlite`
- Database bootstrap and seed logic: `backend/db.js`

## Deploy note

For deployment, run the backend with `npm start` and place it behind a reverse proxy or deploy it to a platform such as Railway or Render.
