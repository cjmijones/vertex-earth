import * as THREE from "three";
import { OrbitControls } from "jsm/controls/OrbitControls.js";
import getStarfield from "./src/getStarfield.js";

/* --------------------------------------------------------
   1) Utility: Spherical UV for Icosahedron (unchanged)
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
    const v = 1.0 - phi / Math.PI;

    uvArray[2 * i + 0] = u;
    uvArray[2 * i + 1] = v;
  }

  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvArray, 2));
  geometry.attributes.uv.needsUpdate = true;
}

/* --------------------------------------------------------
   2) Convert Lat/Lon => XYZ on sphere radius=1
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
   2a) Convert Lat/Lon => the same (u,v) used by the globe
-------------------------------------------------------- */
function latLonToUV(lat, lon) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = -lon * (Math.PI / 180);
  const u = 1.0 - (theta + Math.PI) / (2.0 * Math.PI);
  const v = 1.0 - phi / Math.PI;
  return [u, v];
}


function resetViewToLatLon(lat, lon, cameraDistance = 3.5) {
  // Set globe rotation so that lat/lon is centered
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = -lon * (Math.PI / 180);

  // This rotates the globe so the lat/lon faces forward
  globeGroup.rotation.set(0, theta, 0);

  // Set camera position back and slightly up
  const viewPos = latLonToXYZ(lat, lon, cameraDistance);
  camera.position.copy(viewPos);

  // Always look at the globe center
  orbitCtrl.target.set(0, 0, 0);
  orbitCtrl.update();
}

/* ------------------------
   UI Container Setup
------------------------ */
const uiContainer = document.createElement("div");
Object.assign(uiContainer.style, {
  position: "absolute",
  top: "80px",
  left: "10px",
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  maxHeight: "calc(100vh - 100px)",
  overflowY: "auto",
  zIndex: "1000"
});
document.body.appendChild(uiContainer);

/* --------------------------------------------------------
   2) Create Toggle Buttons to Switch Panels
-------------------------------------------------------- */
const togglePanel = document.createElement("div");
Object.assign(togglePanel.style, {
  display: "flex",
  gap: "10px",
  padding: "6px",
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  borderRadius: "8px",
  backdropFilter: "blur(4px)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
  position: "sticky", 
  top: "0",
  zIndex: "1000"
});

// Create buttons BEFORE applying styles
const btnInfo = document.createElement("button");
btnInfo.textContent = "ℹ️ Info";

const btnControls = document.createElement("button");
btnControls.textContent = "🎛️ Filters";

// Shared button style
const buttonBaseStyle = {
  padding: "8px 16px",
  fontSize: "14px",
  fontWeight: "600",
  color: "#fff",
  backgroundColor: "#333",
  border: "1px solid #666",
  borderRadius: "6px",
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s"
};

Object.assign(btnInfo.style, buttonBaseStyle);
Object.assign(btnControls.style, buttonBaseStyle);

// Highlight active tab
function setActive(btn) {
  [btnInfo, btnControls].forEach(b => {
    b.style.backgroundColor = "#333";
    b.style.borderColor = "#666";
  });
  btn.style.backgroundColor = "#0077cc";
  btn.style.borderColor = "#00aaff";
}

// Append and apply behavior
togglePanel.appendChild(btnInfo);
togglePanel.appendChild(btnControls);
uiContainer.appendChild(togglePanel);

// Event handlers
btnInfo.onclick = () => {
  introPanel.style.display = "block";
  controlBox.style.display = "none";
  setActive(btnInfo);
};

btnControls.onclick = () => {
  introPanel.style.display = "none";
  controlBox.style.display = "block";
  setActive(btnControls);
};

// Set initial state
setActive(btnInfo);

// --- 2ab) Story Navigation Buttons ---
const storyPanel = document.createElement("div");
Object.assign(storyPanel.style, {
  display: "flex",
  gap: "8px",
  paddingTop: "6px",
});

const btnPrev = document.createElement("button");
btnPrev.textContent = "⬅️ Previous";
Object.assign(btnPrev.style, buttonBaseStyle);

const btnNext = document.createElement("button");
btnNext.textContent = "Next ➡️";
Object.assign(btnNext.style, buttonBaseStyle);

storyPanel.appendChild(btnPrev);
storyPanel.appendChild(btnNext);
uiContainer.appendChild(storyPanel);


/* --------------------------------------------------------
   2b) Create Introductory Panel (Above Filters)
   - Removed inline width, rely on CSS below
-------------------------------------------------------- */
const introPanel = document.createElement("div");
introPanel.id = "intro-panel";
Object.assign(introPanel.style, {
  background: "rgba(0, 0, 0, 0.75)",
  color: "white",
  padding: "10px",
  fontFamily: "sans-serif",
  fontSize: "16px",
  borderRadius: "8px",
  zIndex: "999",
  lineHeight: "1.5",
  boxSizing: "border-box",
  marginRight: "0px"
});
introPanel.innerHTML = `

`;
uiContainer.appendChild(introPanel);

/* --------------------------------------------------------
   2c) Create Checkbox UI for Organization Filters
   - Also rely on CSS for responsive widths
-------------------------------------------------------- */
const controlBox = document.createElement("div");
controlBox.id = "control-panel";
Object.assign(controlBox.style, {
  background: "rgba(0,0,0,0.7)",
  color: "white",
  padding: "10px",
  borderRadius: "6px",
  fontFamily: "sans-serif"
});
controlBox.innerHTML = `
  <strong>Rotation Speed:</strong><br>
  <label><input type="radio" name="rotation" value="0.0"> None</label><br>
  <label><input type="radio" name="rotation" value="0.001" checked> Slow</label><br>
  <label><input type="radio" name="rotation" value="0.003"> Fast</label><br><br>

  <strong>Interaction Radius:</strong><br>
  <input type="range" id="radius-slider" min="0.0025" max="0.1" step="0.001" value="0.02">
  <span id="radius-value">0.020</span><br><br>

  <strong>Year Filter:</strong><br>
  Min: <select id="min-year"></select><br>
  Max: <select id="max-year"></select><br><br> 

  <strong>Org Filters:</strong><br>
  <label><input type="checkbox" class="org-filter" value="UN" checked> UN</label><br>
  <label><input type="checkbox" class="org-filter" value="INGO" checked> INGO</label><br>
  <label><input type="checkbox" class="org-filter" value="ICRC" checked> ICRC</label><br>
  <label><input type="checkbox" class="org-filter" value="NRCS and IFRC" checked> NRCS and IFRC</label><br>
  <label><input type="checkbox" class="org-filter" value="NNGO" checked> NNGO</label><br>
  <label><input type="checkbox" class="org-filter" value="Other" checked> Other</label><br>
  <button id="select-all">Select All</button>
  <button id="deselect-all">Deselect All</button>
`;
uiContainer.appendChild(controlBox);

// Initially show the intro, hide filters
introPanel.style.display = "block";
controlBox.style.display = "none";

let originalIncidentGeo = null;
let originalIncidentMeta = null;
let originalIncidentUVs = null;

const radiusSlider = document.getElementById("radius-slider");
const radiusValueLabel = document.getElementById("radius-value");

document.querySelectorAll('input[name="rotation"]').forEach(el => {
  el.addEventListener("change", (e) => {
    rotationSpeed = parseFloat(e.target.value);
  });
});

function reapplyRangeFilter() {
  const min = parseInt(document.getElementById("min-year").value);
  const max = parseInt(document.getElementById("max-year").value);
  filterIncidentPointsInRange(min, max);
}

document.getElementById("select-all").onclick = () => {
  document.querySelectorAll(".org-filter").forEach(cb => cb.checked = true);
  reapplyRangeFilter();
};

document.getElementById("deselect-all").onclick = () => {
  document.querySelectorAll(".org-filter").forEach(cb => cb.checked = false);
  reapplyRangeFilter();
};

document.querySelectorAll(".org-filter").forEach(cb => {
  cb.addEventListener("change", reapplyRangeFilter);
});


radiusSlider.addEventListener("input", (e) => {
  interactionRadius = parseFloat(e.target.value);
  radiusValueLabel.textContent = interactionRadius.toFixed(3);
});

// --- 2d1) Timeline Buttons Go Below Info Panel ---

const timelineContainer = document.createElement("div");
Object.assign(timelineContainer.style, {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  paddingTop: "6px",
});

const playBtn = document.createElement("button");
playBtn.textContent = "▶️ Play";
Object.assign(playBtn.style, buttonBaseStyle);

const pauseBtn = document.createElement("button");
pauseBtn.textContent = "⏸️ Pause";
Object.assign(pauseBtn.style, buttonBaseStyle);

const scrubSlider = document.createElement("input");
Object.assign(scrubSlider, {
  type: "range",
  min: 1997,
  max: 2024,
  value: 1997,
});
Object.assign(scrubSlider.style, {
  flexGrow: "1",
  height: "24px",
});

timelineContainer.appendChild(playBtn);
timelineContainer.appendChild(pauseBtn);
timelineContainer.appendChild(scrubSlider);
uiContainer.appendChild(timelineContainer);



// --- 2e) Story Logic ---
let currentChapter = 0;
let isPlaying = false;
let currentYear = 1997;
let animationInterval = null;
let useDualColors = false;

const chapters = [
  {
    title: "🌐 Humanitarians Under Fire",
    content: `
      <p>
        Welcome to an interactive exploration of global attacks on humanitarian organizations.
        This 3D globe visualizes thousands of security incidents from 1997 to 2024.
      </p>
      <p>
        <strong>Use the toggle filters button above</strong> to adjust:
        <ul style="padding-left:20px; margin: 0;">
          <li>Which organizations are shown</li>
          <li>The range of years to display</li>
          <li>The radius for hovering/interacting</li>
        </ul>
      </p>
      <p>
        Hover over a region to see aggregated stats — including the number of incidents, types of attacks, people affected, and gender breakdowns.
      </p>
      <p>
        You can explore freely or follow the guided story using the <strong>Next</strong> and <strong>Previous</strong> buttons.
      </p>
    `,
    action: () => {
      useDualColors = false;
      introPanel.style.display = "block";
      controlBox.style.display = "none";
      setActive(btnInfo);
      introPanel.innerHTML = `
        <h3 style="margin-top:0; font-size:18px;">🌐 Humanitarians Under Fire</h3>
        ${chapters[0].content}
      `;
    }
  },
  {
    title: "📈 Chapter 1: Rising Attacks Over Time",
    content: `
      <p>
        Over the past two decades, humanitarian workers have increasingly become targets of violence.
        This chapter shows the steady rise in incidents globally from 1997 to 2024.
      </p>
      <p>
        Use the filters to explore trends by year, organization, or region.
        Hover over the globe to see how these incidents aggregate geographically.
      </p>
    `,
    action: () => {
      useDualColors = true;
  
      // Stop rotation & set radio button
      rotationSpeed = 0;
      document.querySelector('input[name="rotation"][value="0.0"]').checked = true;
  
      // Reset view to Middle East
      resetViewToLatLon(15, 20); // lat/lon of Middle East
  
      // UI
      introPanel.style.display = "block";
      controlBox.style.display = "none";
      setActive(btnInfo);
      introPanel.innerHTML = `
        <h3 style="margin-top:0; font-size:18px;">📈 Chapter 1: Rising Attacks Over Time</h3>
        ${chapters[1].content}
      `;
  
      // Start paused at year 1997
      stopPlayback();
      currentYear = 1997;
      scrubSlider.value = currentYear;
      filterIncidentPoints(currentYear); // Only up to 1997 initially
    }
  },
  // You can add more chapters here
];

function startPlayback() {
  clearInterval(animationInterval);
  animationInterval = setInterval(() => {
    if (!isPlaying) return;

    currentYear++;
    if (currentYear > 2024) {
      currentYear = 2024;
      stopPlayback();
    }
    scrubSlider.value = currentYear;
    filterIncidentPoints(currentYear);
  }, 600); // 600ms per year
}

function stopPlayback() {
  isPlaying = false;
  clearInterval(animationInterval);
}

function showChapter(n) {
  if (n >= 0 && n < chapters.length) {
    currentChapter = n;
    chapters[n].action();

    if (n === 0) {
      useDualColors = false;
    
      // Reset year dropdowns
      const yearMin = document.getElementById("min-year");
      const yearMax = document.getElementById("max-year");
      const minYear = parseInt(yearMin.options[0].value);
      const maxYear = parseInt(yearMax.options[yearMax.options.length - 1].value);
    
      yearMin.value = minYear;
      yearMax.value = maxYear;
    
      // Apply full filter with red points
      filterIncidentPointsInRange(minYear, maxYear);
    }

    // Disable/enable buttons based on chapter position
    btnPrev.disabled = (currentChapter === 0);
    btnNext.disabled = (currentChapter === chapters.length - 1);

    // Optional: visually dim disabled buttons
    [btnPrev, btnNext].forEach(btn => {
      btn.style.opacity = btn.disabled ? "0.5" : "1";
      btn.style.cursor = btn.disabled ? "default" : "pointer";
    });

    timelineContainer.style.display = (currentChapter === 1) ? "flex" : "none";
  }
}

btnNext.onclick = () => showChapter(currentChapter + 1);
btnPrev.onclick = () => showChapter(currentChapter - 1);

playBtn.onclick = () => {
  if (!isPlaying) {
    isPlaying = true;
    startPlayback();
  }
};

pauseBtn.onclick = () => {
  stopPlayback();
};

scrubSlider.oninput = () => {
  currentYear = parseInt(scrubSlider.value);
  filterIncidentPoints(currentYear);
};


/* --------------------------------------------------------
   3) Basic Scene Setup
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

let rotationSpeed = 0.001;
let interactionRadius = 0.02;

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
   5) Globe (wireframe) + Group
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
   6) Displacement Points on Globe (Shader)
-------------------------------------------------------- */
const detail = 90;
const pointsGeo = new THREE.IcosahedronGeometry(1, detail);
computeSphericalUV(pointsGeo);

const vertexShader = `
  uniform float size;
  uniform sampler2D elevTexture;
  uniform vec2 mouseUV;
  uniform float interactionRadius;

  varying vec2 vUv;
  varying float vVisible;
  varying float vDist;

  void main() {
    vUv = uv;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 vNormal = normalMatrix * normal;

    float elv = texture2D(elevTexture, vUv).r;
    mvPosition.z += 0.35 * elv;

    // backface culling
    vVisible = step(0.0, dot(-normalize(mvPosition.xyz), normalize(vNormal)));

    float dist = distance(mouseUV, vUv);
    vDist = dist;

    float latFactor = abs(vUv.y - 0.5);
    float thresh = mix(0.5 * interactionRadius, interactionRadius, latFactor);

    float zDisp = 0.0;
    if (dist < thresh) {
      zDisp = clamp((thresh - dist) * 5.0, 0.0, 0.5);
    }

    mvPosition.z += zDisp;
    gl_PointSize = size;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D colorTexture;
  uniform sampler2D alphaTexture;
  uniform sampler2D otherTexture;
  uniform float interactionRadius;

  varying vec2 vUv;
  varying float vVisible;
  varying float vDist;

  void main() {
    if (floor(vVisible + 0.1) == 0.0) discard;
    float alpha = 1.0 - texture2D(alphaTexture, vUv).r;
    vec3 color = texture2D(colorTexture, vUv).rgb;
    vec3 other = texture2D(otherTexture, vUv).rgb;
    float thresh = interactionRadius;
    if (vDist < thresh) {
      color = mix(color, other, (thresh - vDist) * 50.0);
    }
    gl_FragColor = vec4(color, alpha);
  }
`;

const uniforms = {
  size: { value: 4.0 },
  pulseScale: { value: 1.0 }, // 🔥 NEW
  colorTexture: { value: colorMap },
  otherTexture: { value: otherMap },
  elevTexture: { value: elevMap },
  alphaTexture: { value: alphaMap },
  mouseUV: { value: new THREE.Vector2(0.0, 0.0) },
  interactionRadius: { value: interactionRadius },
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
   8) CSV-based Incident Markers
-------------------------------------------------------- */
let incidentPoints = null;
let incidentMeta = [];
let incidentUVs = [];

fetch("./datasets/filtered_security_df.csv")
  .then((response) => response.text())
  .then((csvText) => {
    const lines = csvText.split("\n");
    const header = lines[0].split(",");
    const rawRows = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = lines[i].split(",");
      const rowObj = {};
      for (let c = 0; c < cols.length; c++) {
        rowObj[header[c]] = cols[c];
      }
      rawRows.push(rowObj);
    }

    const positions = [];
    const uvData = [];
    const alignedRows = [];

    rawRows.forEach((row, index) => {
      const lat = parseFloat(row.Latitude);
      const lon = parseFloat(row.Longitude);
      if (isNaN(lat) || isNaN(lon)) {
        console.warn(`Skipping invalid row ${index}:`, row);
        return;
      }
      const pos = latLonToXYZ(lat, lon, 1.035);
      positions.push(pos.x, pos.y, pos.z);
      const [u, v] = latLonToUV(lat, lon);
      uvData.push(u, v);
      alignedRows.push(row);
    });

    const yearSelectMin = document.getElementById("min-year");
    const yearSelectMax = document.getElementById("max-year");

    const uniqueYears = [
      ...new Set(alignedRows.map(r => parseInt(r.Year)).filter(y => !isNaN(y)))
    ].sort((a, b) => a - b);

    uniqueYears.forEach(year => {
      const option1 = new Option(year, year);
      const option2 = new Option(year, year);
      yearSelectMin.add(option1);
      yearSelectMax.add(option2);
    });
    yearSelectMin.value = uniqueYears[0];
    yearSelectMax.value = uniqueYears[uniqueYears.length - 1];

    yearSelectMin.addEventListener("change", () => {
      const min = parseInt(yearSelectMin.value);
      const max = parseInt(yearSelectMax.value);
      filterIncidentPointsInRange(min, max);
    });
    yearSelectMax.addEventListener("change", () => {
      const min = parseInt(yearSelectMin.value);
      const max = parseInt(yearSelectMax.value);
      filterIncidentPointsInRange(min, max);
    });

    incidentMeta = alignedRows;
    incidentUVs = uvData;

    const iGeo = new THREE.BufferGeometry();
    iGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(positions), 3)
    );
    iGeo.setAttribute(
      "incidentUv",
      new THREE.Float32BufferAttribute(new Float32Array(uvData), 2)
    );

    originalIncidentGeo = iGeo;
    originalIncidentMeta = alignedRows;
    originalIncidentUVs = uvData;

    const incidentVertex = `
      attribute vec3 color;
      varying vec3 vColor;
      varying float vVisible;

      uniform float pulseScale;

      void main() {
        vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
        vec3 worldPos = worldPos4.xyz;
        vec3 normal = normalize(worldPos);
        vec3 cameraDir = normalize(cameraPosition - worldPos);
        vVisible = step(0.0, dot(cameraDir, normal));

        vColor = color;

        gl_Position = projectionMatrix * viewMatrix * worldPos4;
        gl_PointSize = 6.0 * pulseScale;
      }
    `;

    const incidentFragment = `
      varying vec3 vColor;
      varying float vVisible;

      void main() {
        if (vVisible < 0.5) discard;
        gl_FragColor = vec4(vColor, 1.0);
      }
    `;

    const incidentMat = new THREE.ShaderMaterial({
      vertexShader: incidentVertex,
      fragmentShader: incidentFragment,
      uniforms: {
        pulseScale: { value: 1.0 }  // this will be shared and updated in animate()
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
    });
    

    incidentPoints = new THREE.Points(iGeo, incidentMat);
    incidentPoints.renderOrder = 1;
    globeGroup.add(incidentPoints);

    // Load first chapter on startup
    showChapter(0);
    const min = parseInt(document.getElementById("min-year").value);
    const max = parseInt(document.getElementById("max-year").value);
    filterIncidentPointsInRange(min, max);

  });

/* --------------------------------------------------------
   Interlude) Fetch Helper Functions
-------------------------------------------------------- */

  function pulsePoints() {
    if (!incidentPoints || !incidentPoints.material || !incidentPoints.material.uniforms) return;
  
    let pulseT = 0;
    const pulseDuration = 500; // 1 second pulse
  
    const start = performance.now();
  
    function animatePulse(now) {
      const elapsed = now - start;
      const t = elapsed / pulseDuration;
  
      // Sinusoidal pulse, peak in middle
      const scale = 1.0 + 0.5 * Math.sin(Math.PI * t);
      incidentPoints.material.uniforms.pulseScale.value = scale;
  
      if (elapsed < pulseDuration) {
        requestAnimationFrame(animatePulse);
      } else {
        incidentPoints.material.uniforms.pulseScale.value = 1.0;
      }
    }
  
    requestAnimationFrame(animatePulse);
  }

  function initialFilterIncidentPoints() {
    const min = parseInt(document.getElementById("min-year").value);
    const max = parseInt(document.getElementById("max-year").value);
    filterIncidentPointsInRange(min, max);
  }
  
  function filterIncidentPointsInRange(minYear, maxYear) {
    const selectedOrgs = Array.from(document.querySelectorAll(".org-filter:checked")).map(cb => cb.value);
    const newPositions = [];
    const newUVs = [];
    const newMeta = [];
    const newColors = [];
  
    originalIncidentMeta.forEach((row, i) => {
      const rowYear = parseInt(row.Year);
      if (isNaN(rowYear) || rowYear < minYear || rowYear > maxYear) return;
  
      const orgMatch = selectedOrgs.some(org => parseFloat(row[org]) > 0);
      if (!orgMatch) return;
  
      const posIdx = i * 3;
      const uvIdx = i * 2;
  
      newPositions.push(
        originalIncidentGeo.getAttribute("position").array[posIdx],
        originalIncidentGeo.getAttribute("position").array[posIdx + 1],
        originalIncidentGeo.getAttribute("position").array[posIdx + 2]
      );
  
      newUVs.push(
        originalIncidentUVs[uvIdx],
        originalIncidentUVs[uvIdx + 1]
      );
  
      if (useDualColors) {
        const isPost2010 = rowYear >= 2010;
        newColors.push(...(isPost2010 ? [1.0, 1.0, 0.2] : [1.0, 0.2, 0.2]));
      } else {
        newColors.push(1.0, 0.2, 0.2); // just red
      }
  
      newMeta.push(row);
    });
  
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
    geo.setAttribute("incidentUv", new THREE.Float32BufferAttribute(newUVs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(newColors, 3));
  
    incidentPoints.geometry.dispose();
    incidentPoints.geometry = geo;
    incidentMeta = newMeta;
    incidentUVs = newUVs;
  
    // pulsePoints();
  }
  
  // This is used by the timeline animation (single year)
  function filterIncidentPoints(year) {
    filterIncidentPointsInRange(1997, year);  // or whatever your minimum year is
  }
  
  

/* --------------------------------------------------------
   9) Info Box for On-Hover Data (Aggregated Tooltip)
-------------------------------------------------------- */
const infoBox = document.getElementById("info-box") || (() => {
  const box = document.createElement("div");
  box.id = "info-box";
  box.style.position = "absolute";
  box.style.top = "105px";
  box.style.right = "10px";
  // removed hard-coded width, rely on CSS (below)
  box.style.maxHeight = "unset";
  box.style.overflow = "visible";
  box.style.padding = "12px 16px";
  box.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
  box.style.color = "#fff";
  box.style.fontFamily = "sans-serif";
  box.style.fontSize = "16px";
  box.style.borderRadius = "8px";
  box.style.display = "none";
  box.style.boxShadow = "0 4px 14px rgba(0,0,0,0.6)";
  box.style.wordWrap = "break-word";
  box.style.zIndex = "1000";
  box.style.maxWidth = "calc(100vw - 40px)";
  document.body.appendChild(box); 
  return box;
})();

const infoToggleContainer = document.createElement("div");
Object.assign(infoToggleContainer.style, {
  position: "absolute",
  top: "80px",
  right: "10px",
  display: "flex",
  flexWrap: "wrap",  // allow wrapping into multiple rows if needed
  justifyContent: "flex-end",
  gap: "10px",
  padding: "8px 12px",
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  borderRadius: "8px",
  boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
  backdropFilter: "blur(4px)",
  zIndex: "1000",
  maxWidth: "calc(100vw - 20px)",
});
document.body.appendChild(infoToggleContainer);


// Keep track of which sections are active
const infoSections = {
  country: true,
  context: true,
  actor: true,
  impact: true,
  gender: true
};

// Shared style for info box buttons (copied from btnInfo style)
const infoButtonStyle = {
  padding: "8px 16px",
  fontSize: "14px",
  fontWeight: "600",
  color: "#fff",
  backgroundColor: "#333",
  border: "1px solid #666",
  borderRadius: "6px",
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s",
  userSelect: "none",
  whiteSpace: "nowrap", // prevent wrapping inside button
};


function createInfoToggleButtons() {
  infoToggleContainer.innerHTML = ""; // clear existing buttons

  const buttons = {
    country: "🌍 Countries",
    context: "📍 Contexts",
    actor: "🎯 Actors",
    impact: "💥 Impact",
    gender: "👥 Gender"
  };

  Object.entries(buttons).forEach(([key, label]) => {
    const btn = document.createElement("button");
    btn.textContent = label;
    Object.assign(btn.style, infoButtonStyle);

    if (infoSections[key]) {
      setInfoButtonActive(btn, true);
    }

    btn.onclick = () => {
      infoSections[key] = !infoSections[key];
      setInfoButtonActive(btn, infoSections[key]);
      showAggregatedTooltip(currentHoverIndices);
    };

    infoToggleContainer.appendChild(btn);
  });
}

function setInfoButtonActive(button, isActive) {
  button.style.backgroundColor = isActive ? "#0077cc" : "#333";
  button.style.borderColor = isActive ? "#00aaff" : "#666";
}

let currentHoverIndices = [];

function showAggregatedTooltip(indices) {
  currentHoverIndices = indices; // persist for toggles

  // Whether we have data or not
  const hasData = indices.length > 0;

  // Either aggregate real incidents or use zeroed placeholder
  const incidents = hasData
    ? indices.map(i => incidentMeta[i]).filter(Boolean)
    : [];

  const total = incidents.length;

  const countryCounts = {};
  const attackContexts = {};
  const actorTypes = {};

  let sumTotalKilled = 0,
      sumTotalWounded = 0,
      sumTotalKidnapped = 0,
      sumTotalAffected = 0;

  let sumGenderMale = 0,
      sumGenderFemale = 0,
      sumGenderUnknown = 0;

  if (hasData) {
    incidents.forEach(row => {
      const country = row.Country || "Unknown";
      const context = row["Attack context"] || "Unknown";
      const actor = row["Actor type"] || "Unknown";

      countryCounts[country] = (countryCounts[country] || 0) + 1;
      attackContexts[context] = (attackContexts[context] || 0) + 1;
      actorTypes[actor] = (actorTypes[actor] || 0) + 1;

      sumTotalKilled     += parseFloat(row["Total killed"])     || 0;
      sumTotalWounded    += parseFloat(row["Total wounded"])    || 0;
      sumTotalKidnapped  += parseFloat(row["Total kidnapped"])  || 0;
      sumTotalAffected   += parseFloat(row["Total affected"])   || 0;

      sumGenderMale      += parseFloat(row["Gender Male"])      || 0;
      sumGenderFemale    += parseFloat(row["Gender Female"])    || 0;
      sumGenderUnknown   += parseFloat(row["Gender Unknown"])   || 0;
    });
  } else {
    // show a placeholder category with zero count
    countryCounts["—"] = 0;
    attackContexts["—"] = 0;
    actorTypes["—"] = 0;
  }

  const topN = 5;
  const formatTop = (obj) => {
    return Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([key, count]) => `<li>${key}: ${count}</li>`)
      .join("");
  };

  let content = `<h4>${hasData ? `${total} Incident${total > 1 ? "s" : ""} Nearby` : `No Nearby Incidents`}</h4>`;

  infoBox.innerHTML = "";

  if (infoSections.country) {
    content += `<strong>Top Countries:</strong><ul>${formatTop(countryCounts)}</ul>`;
  }
  if (infoSections.context) {
    content += `<strong>Attack Contexts:</strong><ul>${formatTop(attackContexts)}</ul>`;
  }
  if (infoSections.actor) {
    content += `<strong>Actor Types:</strong><ul>${formatTop(actorTypes)}</ul>`;
  }
  if (infoSections.impact) {
    content += `
      <strong>People Impacted:</strong>
      <ul>
        <li>Total Killed: ${sumTotalKilled}</li>
        <li>Total Wounded: ${sumTotalWounded}</li>
        <li>Total Kidnapped: ${sumTotalKidnapped}</li>
        <li>Total Affected: ${sumTotalAffected}</li>
      </ul>`;
  }
  if (infoSections.gender) {
    content += `
      <strong>Gender Breakdown:</strong>
      <ul>
        <li>Male: ${sumGenderMale}</li>
        <li>Female: ${sumGenderFemale}</li>
        <li>Unknown: ${sumGenderUnknown}</li>
      </ul>`;
  }

  const bodyDiv = document.createElement("div");
  bodyDiv.innerHTML = content;
  infoBox.appendChild(bodyDiv);
  infoBox.style.display = "block";
}

createInfoToggleButtons();

/* 
   Dynamically adjust info-box styling / # of list items 
   called on load AND on resize
*/
function updateInfoBoxStyle() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  let fontSize = "16px";
  let topN = 5;
  let boxWidth = "";
  let padding = "12px 16px";
  let borderRadius = "8px";

  // slightly smaller for mid-sized
  if (width < 900 || height < 700) {
    fontSize = "15px";
  }
  // smaller screens => fewer list items
  if (width < 600 || height < 500) {
    fontSize = "13px";
    topN = 3;
  }
  // extra small
  if (width < 400) {
    fontSize = "12px";
    topN = 3;
  }

  infoBox.style.fontSize = fontSize;
  infoBox.style.padding = padding;
  infoBox.style.borderRadius = borderRadius;

}

/* --------------------------------------------------------
   10) Raycast + Animate (UV-based aggregator)
-------------------------------------------------------- */
function handleRaycast() {
  raycaster.setFromCamera(pointerPos, camera);

  const globeIntersects = raycaster.intersectObject(globe, false);
  if (globeIntersects.length > 0 && globeIntersects[0].uv) {
    globeUV.copy(globeIntersects[0].uv);
    uniforms.mouseUV.value = globeUV;
  }

  if (!incidentPoints) {
    showAggregatedTooltip([]);
    return;
  }

  const uvThreshold = interactionRadius;
  const uvAttr = incidentPoints.geometry.getAttribute("incidentUv");
  const foundIndices = [];

  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    const dist = Math.sqrt((u - globeUV.x)*(u - globeUV.x) + (v - globeUV.y)*(v - globeUV.y));
    if (dist < uvThreshold) {
      foundIndices.push(i);
    }
  }
  showAggregatedTooltip(foundIndices);
}

let pulseTime = 0;

function animate() {
  requestAnimationFrame(animate);
  globeGroup.rotation.y += rotationSpeed;

  pulseTime += 0.05;
  uniforms.pulseScale.value = 1.0 + 0.25 * Math.sin(pulseTime);

  handleRaycast();
  uniforms.interactionRadius.value = interactionRadius;
  renderer.render(scene, camera);
  orbitCtrl.update();
}

animate();

const controls = document.getElementsByName("rotation");
controls.forEach((el) =>
  el.addEventListener("change", (e) => {
    rotationSpeed = parseFloat(e.target.value);
  })
);

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
  updateInfoBoxStyle();
});

// Call once on load to ensure initial “topN” and sizes are correct
updateInfoBoxStyle();

/* --------------------------------------------------------
   12) Minimal CSS for responsive widths, smaller fonts, etc.
   (Inserted programmatically for convenience)
-------------------------------------------------------- */
const responsiveStyles = document.createElement("style");
responsiveStyles.innerHTML = `
  #intro-panel,
  #control-panel {
    /* Let them grow up to a certain width, then shrink as screen shrinks */
    max-width: 340px;
    width: auto; 
    margin-bottom: 10px;
  }

  /* Info box can also adapt. By default it's in top-right corner. */
  #info-box {
    width: 350px; /* fallback for large screens */
  }

  @media (max-width: 900px) {
    #intro-panel,
    #control-panel {
      font-size: 15px !important;
      max-width: 300px !important;
    }
  }
  @media (max-width: 600px) {
    #intro-panel,
    #control-panel {
      font-size: 13px !important;
      max-width: 260px !important;
    }
    #info-box {
      font-size: 14px !important;
      width: 90vw !important; 
      right: 5vw !important;
    }
  }
  @media (max-width: 400px) {
    #intro-panel,
    #control-panel {
      font-size: 12px !important;
      max-width: 240px !important;
    }
    #info-box {
      font-size: 13px !important;
    }
  }
`;
document.head.appendChild(responsiveStyles);

/* Optional: Only show scrollbars on hover for panels */
const scrollbarStyle = document.createElement("style");
scrollbarStyle.innerHTML = `
  #intro-panel,
  #control-panel {
    overflow-y: hidden;
  }
  #intro-panel:hover,
  #control-panel:hover {
    overflow-y: auto;
  }
`;
document.head.appendChild(scrollbarStyle);
