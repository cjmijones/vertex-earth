import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import getStarfield from "./src/getStarfield.js";

/* --------------------------------------------------------
   1) Utility: Spherical UV for Icosahedron
-------------------------------------------------------- */
function computeSphericalUV(geometry) {
  const pos = geometry.attributes.position;
  const count = pos.count;
  const uvArray = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const theta = Math.atan2(z, x);
    const r = Math.sqrt(x * x + y * y + z * z);
    const phi = Math.acos(y / r);

    const u = 1.0 - (theta + Math.PI) / (2.0 * Math.PI);
    const v = 1.0 - (phi / Math.PI);

    uvArray[2 * i + 0] = u;
    uvArray[2 * i + 1] = v;
  }

  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(uvArray, 2)
  );
  geometry.attributes.uv.needsUpdate = true;
}

/* --------------------------------------------------------
   2) Utility: Convert Lat/Lon => XYZ on sphere of radius=1
      lat: -90..+90, lon: -180..+180
-------------------------------------------------------- */
function latLonToXYZ(lat, lon, radius = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = -lon * (Math.PI / 180);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

/* --------------------------------------------------------
   3) DOM + THREE.js Setup
-------------------------------------------------------- */
const container = document.getElementById("globe-container");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  45,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 3.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const orbitCtrl = new OrbitControls(camera, renderer.domElement);
orbitCtrl.enableDamping = true;

const raycaster = new THREE.Raycaster();
const pointerPos = new THREE.Vector2();
const globeUV = new THREE.Vector2();

/* --------------------------------------------------------
   4) Load Textures
-------------------------------------------------------- */
const textureLoader = new THREE.TextureLoader();
const starSprite = textureLoader.load("./src/circle.png");
const otherMap = textureLoader.load("./src/04_rainbow1k.jpg");
const colorMap = textureLoader.load("./src/00_earthmap1k.jpg");
const elevMap = textureLoader.load("./src/01_earthbump1k.jpg");
const alphaMap = textureLoader.load("./src/02_earthspec1k.jpg");

/* --------------------------------------------------------
   5) Create Globe (wireframe) + Group
-------------------------------------------------------- */
const globeGroup = new THREE.Group();
scene.add(globeGroup);

const globeGeo = new THREE.IcosahedronGeometry(1, 16);
computeSphericalUV(globeGeo);

const globeMat = new THREE.MeshBasicMaterial({
  color: 0x005577,
  wireframe: true,
  transparent: true,
  opacity: 0.075,
  depthWrite: false,
});

const globe = new THREE.Mesh(globeGeo, globeMat);
globe.renderOrder = 2;
globeGroup.add(globe);

/* --------------------------------------------------------
   6) Create Displacement Points on Globe (Shader)
-------------------------------------------------------- */
const detail = 90;
const pointsGeo = new THREE.IcosahedronGeometry(1, detail);
computeSphericalUV(pointsGeo);

const vertexShader = `
  uniform float size;
  uniform sampler2D elevTexture;
  uniform vec2 mouseUV;

  varying vec2 vUv;
  varying float vVisible;
  varying float vDist;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float elv = texture2D(elevTexture, vUv).r;
    vec3 vNormal = normalMatrix * normal;

    // cull backside points of the globe geometry itself
    vVisible = step(0.0, dot(-normalize(mvPosition.xyz), normalize(vNormal)));

    // Elevation displacement
    mvPosition.z += 0.35 * elv;

    // Mouse-based effect
    float dist = distance(mouseUV, vUv);
    float lat = abs(vUv.y - 0.5);
    float thresh = mix(0.03, 0.07, lat);

    float zDisp = 0.0;
    if (dist < thresh) {
      zDisp = (thresh - dist) * 5.0;
    }
    vDist = dist;

    mvPosition.z += zDisp;

    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D colorTexture;
  uniform sampler2D alphaTexture;
  uniform sampler2D otherTexture;

  varying vec2 vUv;
  varying float vVisible;
  varying float vDist;

  void main() {
    if (floor(vVisible + 0.1) == 0.0) discard;
    float alpha = 1.0 - texture2D(alphaTexture, vUv).r;
    vec3 color = texture2D(colorTexture, vUv).rgb;
    vec3 other = texture2D(otherTexture, vUv).rgb;
    float thresh = 0.04;
    if (vDist < thresh) {
      color = mix(color, other, (thresh - vDist) * 50.0);
    }
    gl_FragColor = vec4(color, alpha);
  }
`;

const uniforms = {
  size: { value: 4.0 },
  colorTexture: { value: colorMap },
  otherTexture: { value: otherMap },
  elevTexture: { value: elevMap },
  alphaTexture: { value: alphaMap },
  mouseUV: { value: new THREE.Vector2(0.0, 0.0) },
};

const pointsMat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader,
  fragmentShader,
  transparent: true,
  depthWrite: false,
});

const points = new THREE.Points(pointsGeo, pointsMat);
globeGroup.add(points);

/* --------------------------------------------------------
   7) Lights + Starfield
-------------------------------------------------------- */
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 3));
scene.add(getStarfield({ numStars: 4500, sprite: starSprite }));

/* --------------------------------------------------------
   8) CSV-based Incident Markers with Shader Culling
-------------------------------------------------------- */
let incidentPoints = null;
let incidentMeta = [];

fetch("./datasets/security_incidents.csv")
  .then((response) => response.text())
  .then((csvText) => {
    // parse CSV lines
    const lines = csvText.split("\n");
    const header = lines[0].split(",");
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(",");
      const rowObj = {};
      for (let c = 0; c < cols.length; c++) {
        rowObj[header[c]] = cols[c];
      }
      rows.push(rowObj);
    }

    incidentMeta = rows;

    // Build positions array
    const positions = [];
    rows.forEach((row) => {
      const lat = parseFloat(row.Latitude);
      const lon = parseFloat(row.Longitude);
      if (isNaN(lat) || isNaN(lon)) return;
      const v = latLonToXYZ(lat, lon, 1.035);
      positions.push(v.x, v.y, v.z);
    });

    const iGeo = new THREE.BufferGeometry();
    iGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3)
    );

    // UPDATED: Use world-space dot-product in the vertex shader
    const incidentVertex = `
      varying float vVisible;

      void main() {
        // transform local point to world coordinates
        vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
        vec3 worldPos = worldPos4.xyz;

        // normal is direction from origin to this point, for a sphere at (0,0,0)
        vec3 normal = normalize(worldPos);

        // camera direction in world space
        vec3 cameraDir = normalize(cameraPosition - worldPos);

        // cull if behind sphere from this camera angle
        vVisible = step(0.0, dot(cameraDir, normal));

        // transform to clip space
        gl_Position = projectionMatrix * viewMatrix * worldPos4;
        gl_PointSize = 6.0;
      }
    `;

    const incidentFragment = `
      varying float vVisible;
      void main() {
        if (vVisible < 0.5) discard;
        gl_FragColor = vec4(1.0, 0.1, 0.1, 1.0);
      }
    `;

    const incidentMat = new THREE.ShaderMaterial({
      vertexShader: incidentVertex,
      fragmentShader: incidentFragment,
      transparent: true,
    });

    incidentPoints = new THREE.Points(iGeo, incidentMat);
    incidentMat.depthWrite = true;
    incidentMat.depthTest = true;
    incidentPoints.renderOrder = 1;
    incidentPoints.renderOrder = 1;
    globeGroup.add(incidentPoints);
  });

/* --------------------------------------------------------
   9) Info Box for On-Hover Data
-------------------------------------------------------- */
const infoBox = document.getElementById("info-box");
function showIncidentInfo(index) {
  if (index === null) {
    infoBox.style.display = "none";
    return;
  }
  const row = incidentMeta[index];
  if (!row) return; // out of range

  infoBox.innerHTML = `
    <h4>Incident #${row["Incident ID"] || "(unknown)"}</h4>
    <p><strong>Country:</strong> ${row.Country || "N/A"}</p>
    <p><strong>Date:</strong> ${row.Year}-${row.Month || ""}-${row.Day || ""}</p>
    <p><strong>Details:</strong> ${row.Details || "No info"}</p>
  `;
  infoBox.style.display = "block";
}

/* --------------------------------------------------------
   10) Raycast + Animate
-------------------------------------------------------- */
function handleRaycast() {
  raycaster.setFromCamera(pointerPos, camera);

  const intersectTargets = [globe];
  if (incidentPoints) {
    intersectTargets.push(incidentPoints);
  }

  const intersects = raycaster.intersectObjects(intersectTargets, false);

  let foundIncidentIndex = null;
  let foundGlobeUV = null;

  for (const inter of intersects) {
    if (inter.object === incidentPoints) {
      foundIncidentIndex = inter.index;
    }
    if (inter.object === globe && inter.uv) {
      foundGlobeUV = inter.uv;
    }
  }

  if (foundGlobeUV) {
    globeUV.copy(foundGlobeUV);
    uniforms.mouseUV.value = globeUV;
  }

  showIncidentInfo(foundIncidentIndex);
}

function animate() {
  requestAnimationFrame(animate);
  globeGroup.rotation.y += 0.001;
  handleRaycast();
  renderer.render(scene, camera);
  orbitCtrl.update();
}
animate();

/* --------------------------------------------------------
   11) Mouse + Resize
-------------------------------------------------------- */
window.addEventListener("mousemove", (evt) => {
  const rect = container.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  pointerPos.set(
    (x / rect.width) * 2 - 1,
    -(y / rect.height) * 2 + 1
  );
});

window.addEventListener("resize", () => {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});
