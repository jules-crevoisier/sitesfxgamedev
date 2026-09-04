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
2. Dans Dokploy → **New Application** → connecte le repo  
3. **Build Type :** `Dockerfile`  
4. **Dockerfile path :** `Dockerfile`  
5. **Docker context :** `.`  
6. Domaine → port **`80`**  
7. Deploy  

Les headers `Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy` sont dans `nginx.conf` (indispensables pour ffmpeg.wasm).

### Local Docker

```powershell
docker compose up --build
```

Ouvre `http://localhost`.

## Qualité OGG

| Preset | Environ | Usage |
|--------|---------|--------|
| Léger | ~96 kbps | petits fichiers |
| Jeu | ~160 kbps | recommandé SFX |
| HD | ~224 kbps | plus fidèle |
| Max | ~320 kbps | plus lourd |
