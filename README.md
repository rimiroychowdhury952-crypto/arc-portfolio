# ARC Portfolio

Personal portfolio website with a premium cosmic dark theme and a 3D metallic infinity loop in the hero.

**Live site:** https://rimiroychowdhury952-crypto.github.io/arc-portfolio/

## Built with

- HTML5, CSS3, JavaScript
- Three.js (stored locally, loaded only when needed)
- No framework, no build step

## Features

- Responsive layout for desktop and mobile
- Dark and light theme with saved preference
- Project cards with detail dialogs and an image lightbox
- Keyboard-friendly navigation and reduced-motion support
- Fallback when WebGL is not available

## Project structure

```
index.html
robots.txt
sitemap.xml
assets/
  css/style.css
  js/            main.js, projects.js, theme-init.js, hero3d-loader.js, hero3d.js
  images/        project previews and social preview image
  vendor/three/  Three.js
```

## Run locally

Open the folder with any local web server (for example XAMPP) and visit `index.html`.
Opening the file directly may not load the 3D loop, because browsers block ES modules on `file://`.

## Deployment

Hosted on GitHub Pages from the `wakamole` branch. A `.nojekyll` file is included so GitHub does not process the site with Jekyll.
