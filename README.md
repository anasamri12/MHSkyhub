# MHSkyhub

Static dual-interface prototype for the MHSkyhub passenger infotainment screen and the cabin crew tablet dashboard.

## Live demo

- Passenger: https://iridescent-treacle-a1a40a.netlify.app/passenger/index.html
- Crew: https://iridescent-treacle-a1a40a.netlify.app/crew/index.html

## Project structure

```text
MHSkyhub/
|- assets/
|  |- branding/
|  |- posters/
|  |  |- movies/
|  |  `- tv/
|  `- widgets/
|- passenger/
|  |- css/
|  |  `- main.css
|  |- js/
|  |  `- app.js
|  `- index.html
|- crew/
|  |- css/
|  |  `- main.css
|  |- js/
|  |  `- app.js
|  `- index.html
|- tools/
`- index.html / crew.html
```

## Notes

- `passenger/` contains the passenger-facing infotainment app for the seatback display.
- `crew/` contains the crew-facing request dashboard for the cabin tablet.
- `assets/` is shared by both devices so branding, posters, and widget artwork stay in one place.
- Root `index.html` and `crew.html` are lightweight redirect entry points for convenience.
