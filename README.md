# SFX Lab

Traitement local de SFX pour jeux vidéo (navigateur · ffmpeg.wasm).

**Entrée :** MP3, WAV, OGG, FLAC, AAC, M4A, AIFF, Opus, WMA, WebM…  
**Sortie :** `.ogg` Vorbis (preview écoute en WAV)

## Pipeline

1. Couper le blanc  
2. Amplify (style Audacity → pic cible)  
3. Niveau final **−6 dB**  
4. Export OGG  

## Dev

```powershell
npm install
npm run dev
```

Les en-têtes **COOP / COEP** sont requis pour `SharedArrayBuffer` (déjà dans `vite.config.ts`).

## Build

```powershell
npm run build
npm run preview
```

## Deploy Dokploy (recommandé)

1. Pousse le repo sur GitHub / GitLab  
2. Dans Dokploy → **Docker Compose** (ou Application) → connecte le repo  
3. Branche : `main`  
4. Compose file : `docker-compose.yml`  
5. Domaine → pointe vers le service **`sfxlab`**, port **`80`** (interne)  
6. Deploy  

> Ne mappe pas `80:80` sur l’hôte : Dokploy / Traefik route le domaine vers le conteneur.  
> Les headers `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy` sont dans `nginx.conf` (indispensables pour ffmpeg.wasm).

### Local Docker

```powershell
docker compose -f docker-compose.yml up --build
# Si tu veux ouvrir en local sur le port 8080 :
# ajoute temporairement ports: ["8080:80"] sous sfxlab
```

Ou build direct :

```powershell
docker build -t sfxlab .
docker run --rm -p 8080:80 sfxlab
```

Ouvre `http://localhost:8080`.

## Qualité OGG

| Preset | Environ | Usage |
|--------|---------|--------|
| Léger | ~96 kbps | petits fichiers |
| Jeu | ~160 kbps | recommandé SFX |
| HD | ~224 kbps | plus fidèle |
| Max | ~320 kbps | plus lourd |
