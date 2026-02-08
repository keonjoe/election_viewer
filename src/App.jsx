import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Play, Pause, Info, Map as MapIcon, ChevronRight, ChevronLeft, Layers, Moon, Sun, Maximize2, Eye, EyeOff, Globe, Github, LayoutGrid, ScatterChart, ChevronDown, ChevronUp } from 'lucide-react';
import JSZip from 'jszip';

/**
 * UTILITY: Script Loader Hook
 * Ensures D3, TopoJSON, and SQL.js are available.
 */
const useScript = (src) => {
    const [status, setStatus] = useState(src ? 'loading' : 'idle');
    useEffect(() => {
        if (!src) {
            setStatus('idle');
            return;
        }
        let script = document.querySelector(`script[src="${src}"]`);
        if (!script) {
            script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.setAttribute('data-status', 'loading');
            document.body.appendChild(script);
            const setAttributeFromEvent = (event) => {
                script.setAttribute('data-status', event.type === 'load' ? 'ready' : 'error');
                setStatus(event.type === 'load' ? 'ready' : 'error');
            };
            script.addEventListener('load', setAttributeFromEvent);
            script.addEventListener('error', setAttributeFromEvent);
        } else {
            setStatus(script.getAttribute('data-status'));
        }
        const setStateFromEvent = (event) => {
            setStatus(event.type === 'load' ? 'ready' : 'error');
        };
        script.addEventListener('load', setStateFromEvent);
        script.addEventListener('error', setStateFromEvent);
        return () => {
            if (script) {
                script.removeEventListener('load', setStateFromEvent);
                script.removeEventListener('error', setStateFromEvent);
            }
        };
    }, [src]);
    return status;
};

/**
 * UTILITY: Barycentric Triangle Gradient Functions
 */
// Convert hex color to RGB array
const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : [0, 0, 0];
};

// Calculate area of triangle given coords
const triangleArea = (p1, p2, p3) => {
    return Math.abs((p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y)) / 2.0);
};

// Calculate barycentric coordinates for point p relative to triangle p1,p2,p3
const getBarycentric = (p, p1, p2, p3) => {
    const totalArea = triangleArea(p1, p2, p3);
    if (totalArea === 0) return [0, 0, 0];

    const area1 = triangleArea(p, p2, p3);
    const area2 = triangleArea(p1, p, p3);
    const area3 = triangleArea(p1, p2, p);

    return [area1 / totalArea, area2 / totalArea, area3 / totalArea];
};

// Check if point p is inside triangle p1,p2,p3
const isInside = (p, p1, p2, p3) => {
    const area = triangleArea(p1, p2, p3);
    const area1 = triangleArea(p, p2, p3);
    const area2 = triangleArea(p1, p, p3);
    const area3 = triangleArea(p1, p2, p);
    return Math.abs(area - (area1 + area2 + area3)) < 1.0;
};

/**
 * COMPONENT: Triangle Legend with Barycentric Gradient
 */
const TriangleLegend = ({ isDarkMode, mode }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const width = canvas.width;
        const height = canvas.height;
        const styleWidth = 100;
        const styleHeight = 120;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.scale(2, 2); // Supersample

        const effectiveWidth = styleWidth;
        const effectiveHeight = styleHeight;

        // Draw background rounded rectangle
        ctx.fillStyle = isDarkMode ? 'rgba(71, 85, 105, 0.8)' : 'rgba(100, 116, 139, 0.8)';
        ctx.beginPath();
        ctx.roundRect(0, 0, effectiveWidth, effectiveHeight, 8);
        ctx.fill();

        // Create image data for gradient - we need to draw this onto a temporary canvas 
        // because direct pixel manipulation doesn't respect scale() in the same way for putImageData
        // OR we just map pixels to the scaled coordinates. 
        // Simpler: Just do pixel manipulation on the full sized buffer (200x240).

        ctx.restore(); // Undo scale for pixel manipulation convenience

        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;

        // Define triangle points and center (scaled by 2 for high-DPI)
        const scale = 2;
        const points = [
            { x: 50 * scale, y: 22 * scale, color: isDarkMode ? PARTIES.THIRD.darkColor : PARTIES.THIRD.color },
            { x: 90 * scale, y: 92 * scale, color: isDarkMode ? PARTIES.REP.darkColor : PARTIES.REP.color },
            { x: 10 * scale, y: 92 * scale, color: isDarkMode ? PARTIES.DEM.darkColor : PARTIES.DEM.color },
            { x: 50 * scale, y: 65 * scale, color: '#800080' },
        ];

        // Pre-calculate RGBs
        const rgbs = points.map(p => hexToRgb(p.color));
        const [p0, p1, p2, center] = points;
        const [c0, c1, c2, cCenter] = rgbs;

        // Bounding box optimization
        const minX = Math.floor(Math.min(p0.x, p1.x, p2.x));
        const maxX = Math.ceil(Math.max(p0.x, p1.x, p2.x));
        const minY = Math.floor(Math.min(p0.y, p1.y, p2.y));
        const maxY = Math.ceil(Math.max(p0.y, p1.y, p2.y));

        const startX = Math.max(0, minX);
        const endX = Math.min(width, maxX);
        const startY = Math.max(0, minY);
        const endY = Math.min(height, maxY);

        // Rasterization Loop - different behavior based on mode
        if (mode === 'winner') {
            // Winner mode: 3 solid color regions (no purple center)
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const p = { x, y };
                    let colorToUse = null;

                    // Determine which sub-triangle and use only the 3 corner colors
                    if (isInside(p, p0, p1, center)) {
                        // Top-Right region: use third party or republican
                        const w = getBarycentric(p, p0, p1, center);
                        colorToUse = w[0] > w[1] ? c0 : c1;
                    }
                    else if (isInside(p, p1, p2, center)) {
                        // Right-Left region: use republican or democrat
                        const w = getBarycentric(p, p1, p2, center);
                        colorToUse = w[0] > w[1] ? c1 : c2;
                    }
                    else if (isInside(p, p2, p0, center)) {
                        // Left-Top region: use democrat or third party
                        const w = getBarycentric(p, p2, p0, center);
                        colorToUse = w[0] > w[1] ? c2 : c0;
                    } else {
                        continue;
                    }

                    if (colorToUse) {
                        const index = (y * width + x) * 4;
                        data[index] = colorToUse[0];
                        data[index + 1] = colorToUse[1];
                        data[index + 2] = colorToUse[2];
                        data[index + 3] = 255;
                    }
                }
            }
        } else {
            // Gradient mode: smooth interpolation
            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const p = { x, y };
                    let w = [0, 0, 0];
                    let colorSet = [];

                    // Determine which sub-triangle the pixel is in
                    if (isInside(p, p0, p1, center)) {
                        w = getBarycentric(p, p0, p1, center);
                        colorSet = [c0, c1, cCenter];
                    }
                    else if (isInside(p, p1, p2, center)) {
                        w = getBarycentric(p, p1, p2, center);
                        colorSet = [c1, c2, cCenter];
                    }
                    else if (isInside(p, p2, p0, center)) {
                        w = getBarycentric(p, p2, p0, center);
                        colorSet = [c2, c0, cCenter];
                    } else {
                        continue;
                    }

                    // Interpolate Color
                    const r = w[0] * colorSet[0][0] + w[1] * colorSet[1][0] + w[2] * colorSet[2][0];
                    const g = w[0] * colorSet[0][1] + w[1] * colorSet[1][1] + w[2] * colorSet[2][1];
                    const b = w[0] * colorSet[0][2] + w[1] * colorSet[1][2] + w[2] * colorSet[2][2];

                    // Set Pixel Data
                    const index = (y * width + x) * 4;
                    data[index] = r;
                    data[index + 1] = g;
                    data[index + 2] = b;
                    data[index + 3] = 255;
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);



        // Draw labels
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center';

        ctx.fillStyle = '#10b981'; // 3rd party (Emerald)
        ctx.fillText('3', p0.x, p0.y - 7);

        ctx.fillStyle = '#ff0000'; // Republican
        ctx.fillText('R', p1.x, p1.y + 16);

        ctx.fillStyle = '#0000ff'; // Democrat
        ctx.fillText('D', p2.x, p2.y + 16);

    }, [isDarkMode, mode]);

    return (
        <div className="flex flex-col items-center gap-2">
            <canvas
                ref={canvasRef}
                width={200}
                height={240}
                className="drop-shadow-sm"
                style={{ width: '100px', height: '120px' }}
            />
        </div>
    );
};

/**
 * CONSTANTS & CONFIG
 */
const YEARS = [
    2000, 2004, 2008, 2012, 2016, 2020, 2024
];

const LAYOUTS = {
    GEO: 'geo',
    CARTOGRAM: 'cartogram',
    GRID: 'grid',
    SCATTER: 'scatter'
};

const PARTIES = {
    DEM: { name: 'Democrat', color: '#0000ff', darkColor: '#00008b' }, // Pure Blue
    REP: { name: 'Republican', color: '#ff0000', darkColor: '#8b0000' }, // Pure Red
    THIRD: { name: 'Third Party', color: '#10b981', darkColor: '#059669' } // Green (Emerald)
};

const STATE_FIPS_MAP = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE",
    "11": "DC", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA",
    "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM",
    "36": "NY", "37": "NC", "38": "ND", "39": "OH", "40": "OK", "41": "OR", "42": "PA", "44": "RI",
    "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY", "60": "AS", "66": "GU", "69": "MP", "72": "PR", "78": "VI"
};

/**
 * WORKER: Cartogram Layout Calculator
 * Moves expensive D3 force simulation off the main thread.
 */
const CARTOGRAM_WORKER_CODE = `
importScripts("https://d3js.org/d3.v7.min.js");

let mapPaths = null;

self.onmessage = function(e) {
    const { type, payload } = e.data;

    if (type === 'INIT_GEOMETRY') {
        mapPaths = payload;
        return;
    }

    if (type === 'CALCULATE_YEAR') {
        const { year, electionDataForYear } = payload;
        
        if (!mapPaths || !self.d3) {
            self.postMessage({ type: 'ERROR', year, error: 'Dependencies not loaded' });
            return;
        }

        try {
            // 1. Calculate Scale Factor
            let totalVotes = 0;
            let totalArea = 0;
            for (let i = 0; i < mapPaths.length; i++) {
                const p = mapPaths[i];
                const votes = electionDataForYear[p.id]?.total || 0;
                totalVotes += votes;
                totalArea += p.area;
            }
            
            const scaleFactor = totalVotes > 0 ? totalArea / totalVotes : 0;
            if (scaleFactor === 0) {
                 self.postMessage({ type: 'RESULT', year, positions: null });
                 return;
            }

            // 2. Create nodes
            const nodes = mapPaths.map(p => {
                const data = electionDataForYear[p.id];
                const targetArea = (data?.total || 0) * scaleFactor;
                const r = Math.sqrt(Math.max(0.1, targetArea) / Math.PI);

                return {
                    id: p.id,
                    x: p.centroid[0],
                    y: p.centroid[1],
                    rx: p.centroid[0],
                    ry: p.centroid[1],
                    r: r
                };
            });

            // 3. Run simulation
            const simulation = self.d3.forceSimulation(nodes)
                .force("x", self.d3.forceX(d => d.rx).strength(0.45))
                .force("y", self.d3.forceY(d => d.ry).strength(0.45))
                .force("collide", self.d3.forceCollide(d => d.r + 0.5).strength(1).iterations(3))
                .stop();

            // Run ticks (150 matches main thread logic)
            for (let i = 0; i < 150; ++i) simulation.tick();

            // 4. Format positions
            const positions = {};
            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                positions[n.id] = { x: n.x, y: n.y, r: n.r };
            }

            self.postMessage({ type: 'RESULT', year, positions });
            
        } catch (err) {
            self.postMessage({ type: 'ERROR', year, error: err.message });
        }
    }
};
`;


/**
 * MAIN COMPONENT
 */
export default function ElectionVisualizer() {
    const d3Status = useScript('https://d3js.org/d3.v7.min.js');
    const topoStatus = useScript('https://unpkg.com/topojson-client@3');
    const [dataStatus, setDataStatus] = useState('idle'); // idle, loading, ready, error

    const [topology, setTopology] = useState(null);
    const [year, setYear] = useState(2020);
    const [mode, setMode] = useState('gradient');
    const [layoutMode, setLayoutMode] = useState(LAYOUTS.GEO);
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return false;
    });
    const [isPlaying, setIsPlaying] = useState(false);
    const [hovered, setHovered] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [showBorders, setShowBorders] = useState(false);

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);
    const [layoutPositions, setLayoutPositions] = useState(null);
    const [viewState, setViewState] = useState({ k: 1, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });


    const [cacheProgress, setCacheProgress] = useState({ count: 1, total: YEARS.length });
    const [electionData, setElectionData] = useState({});

    const mapRef = useRef(null);
    const svgRef = useRef(null);
    const cartogramCache = useRef({});
    const gridCache = useRef({});
    const scatterCache = useRef({});
    const touchRef = useRef({ dist: null });

    // UI Local State for Dropdown
    const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

    // Helper: Get Interpolated Data for continuous time
    const getInterpolatedData = useCallback((fips, tYear) => {
        if (!electionData || Object.keys(electionData).length === 0) return null;

        const prevYear = YEARS.filter(y => y <= tYear).pop() || YEARS[0];
        const nextYear = YEARS.find(y => y > tYear) || YEARS[YEARS.length - 1];

        const dataPrev = electionData[prevYear]?.[fips];
        const dataNext = electionData[nextYear]?.[fips];

        if (!dataPrev && !dataNext) return null;
        if (!dataPrev) return dataNext;
        if (!dataNext) return dataPrev;

        if (prevYear === nextYear) return dataPrev;

        const ratio = (tYear - prevYear) / (nextYear - prevYear);

        // Interpolate raw vote counts
        const demVotes = dataPrev.demVotes + (dataNext.demVotes - dataPrev.demVotes) * ratio;
        const repVotes = dataPrev.repVotes + (dataNext.repVotes - dataPrev.repVotes) * ratio;
        const thirdVotes = (dataPrev.thirdVotes || 0) + ((dataNext.thirdVotes || 0) - (dataPrev.thirdVotes || 0)) * ratio;
        const total = demVotes + repVotes + thirdVotes;
        const twoPartyTotal = demVotes + repVotes;

        return {
            ...dataPrev,
            demVotes,
            repVotes,
            thirdVotes,
            total,
            demShare: twoPartyTotal > 0 ? demVotes / twoPartyTotal : 0,
            repShare: twoPartyTotal > 0 ? repVotes / twoPartyTotal : 0,
            thirdShare: total > 0 ? thirdVotes / total : 0,
            winner: repVotes > demVotes ? 'REP' : 'DEM',
            thirdParty1: ratio < 0.5 ? dataPrev.thirdParty1 : dataNext.thirdParty1,
            thirdParty2: ratio < 0.5 ? dataPrev.thirdParty2 : dataNext.thirdParty2
        };
    }, [electionData]);

    // 1. Initialize Map
    useEffect(() => {
        if (d3Status === 'ready' && topoStatus === 'ready') {
            fetch('https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json')
                .then(response => response.json())
                .then(us => setTopology(us));
        }
    }, [d3Status, topoStatus]);

    // 2. Load CSV Data (Optimized - Zipped)
    useEffect(() => {
        if (d3Status === 'ready' && dataStatus === 'idle') {
            setDataStatus('loading');

            // Fetch Zipped CSV and decompress using JSZip
            // Use relative path - Vite serves public folder at root
            const dataUrl = '/election_data.csv.zip';
            console.log('Fetching from:', dataUrl);

            fetch(dataUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    console.log('Fetched zipped election data successfully');
                    return response.arrayBuffer();
                })
                .then(buffer => {
                    console.log('Buffer size:', buffer.byteLength);
                    return JSZip.loadAsync(buffer);
                })
                .then(zip => {
                    // Find the CSV file inside. Filter out macOS metadata files.
                    const csvFilename = Object.keys(zip.files).find(name =>
                        name.endsWith('.csv') && !name.includes('__MACOSX') && !name.split('/').pop().startsWith('.')
                    ) || Object.keys(zip.files).find(name => !name.endsWith('/')); // Fallback to first non-directory file

                    if (!csvFilename) {
                        throw new Error('No CSV file found in the zip archive');
                    }

                    console.log(`Extracting ${csvFilename}...`);
                    return zip.file(csvFilename).async("string");
                })
                .then(csvText => {
                    console.log('Parsing CSV data...');
                    // Parse CSV manually
                    const lines = csvText.trim().split('\n');
                    const allData = {};

                    for (let i = 1; i < lines.length; i++) {
                        // Handle simple CSV parsing, handling basic quotes
                        // We assume standard format: "year","fips",dem,rep,third,total
                        // Note: A robust regex parser would be safer for complex CSVs, but this works for the known format
                        // We'll just strip all quotes from values for simplicity as we know the structure
                        const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());

                        if (values.length < 6) continue;

                        const year = +values[0];
                        const fips = values[1].padStart(5, '0');
                        const dem = +values[2];
                        const rep = +values[3];
                        const third = +values[4];
                        const total = +values[5];

                        // Debug: Log Dane County (55025) and Brewster County (48043) 2024 data
                        if (year === 2024 && (fips === '55025' || fips === '48043')) {
                            console.log(`${fips} (${year}): dem=${dem}, rep=${rep}, third=${third}, total=${total}`);
                            console.log('Raw line:', lines[i]);
                        }

                        // Parse third-party candidates (format: "NAME|PARTY|VOTES")
                        const third1Raw = values[6] ? values[6].replace(/"/g, '') : '';
                        const third2Raw = values[7] ? values[7].replace(/"/g, '') : '';

                        const parseThirdParty = (raw) => {
                            if (!raw) return null;
                            const parts = raw.split('|');
                            if (parts.length !== 3) return null;
                            return {
                                name: parts[0],
                                party: parts[1],
                                votes: +parts[2]
                            };
                        };

                        const thirdParty1 = parseThirdParty(third1Raw);
                        const thirdParty2 = parseThirdParty(third2Raw);

                        // Calculate two-party vote share (excludes third parties)
                        const twoPartyTotal = dem + rep;
                        const allVotesTotal = dem + rep + third;

                        if (!allData[year]) allData[year] = {};
                        allData[year][fips] = {
                            demVotes: dem,
                            repVotes: rep,
                            thirdVotes: third,
                            total: total,
                            thirdParty1: thirdParty1,
                            thirdParty2: thirdParty2,
                            // Use two-party vote for share calculation
                            demShare: twoPartyTotal > 0 ? dem / twoPartyTotal : 0,
                            repShare: twoPartyTotal > 0 ? rep / twoPartyTotal : 0,
                            // Third party share relative to all votes
                            thirdShare: allVotesTotal > 0 ? third / allVotesTotal : 0,
                            winner: dem > rep ? 'DEM' : 'REP'
                        };
                    }

                    console.log('Data loaded successfully:', Object.keys(allData).length, 'years');
                    setElectionData(allData);
                    setDataStatus('ready');
                })
                .catch(err => {
                    console.error("Failed to load data:", err);
                    console.error("Error type:", err.constructor.name);
                    console.error("Error message:", err.message);
                    console.error("Error stack:", err.stack);
                    setDataStatus('error');
                });
        }
    }, [d3Status, dataStatus]);

    // Playback Loop (Continuous)
    useEffect(() => {
        let animationId;
        if (isPlaying && Object.keys(electionData).length > 0) {
            const loop = () => {
                setYear(prev => {
                    const next = prev + 0.3; // 3x speed
                    if (next > YEARS[YEARS.length - 1]) return YEARS[0]; // Infinite Loop
                    return next;
                });
                animationId = requestAnimationFrame(loop);
            };
            loop();
        } else {
            // Snap to nearest 4-year election cycle when paused
            // Use functional update to avoid 'year' dependency and avoid re-renders during drag
            setYear(currentYear => {
                const nearest = YEARS.reduce((prev, curr) => Math.abs(curr - currentYear) < Math.abs(prev - currentYear) ? curr : prev);
                // Only snap if significantly different (though React handles same-value bailouts)
                return nearest;
            });
        }
        return () => cancelAnimationFrame(animationId);
    }, [isPlaying, electionData]);

    // Dimensions
    const width = 960;
    const height = 600;



    // Memoize Map Geometry + Centroids + Areas for Cartogram
    const mapPaths = useMemo(() => {
        if (!topology || !window.d3 || !window.topojson) return null;

        const geojson = window.topojson.feature(topology, topology.objects.counties);
        const projection = window.d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]);
        const pathGenerator = window.d3.geoPath().projection(projection);

        return geojson.features.map(feature => {
            const d = pathGenerator(feature);
            if (!d) return null;

            // Calculate Centroid and Projected Area (in pixels) for Cartogram scaling
            const centroid = pathGenerator.centroid(feature);
            const area = pathGenerator.area(feature);

            return {
                id: feature.id,
                d,
                feature,
                centroid,
                area: area || 0.1 // Prevent divide by zero
            };
        }).filter(Boolean);
    }, [topology]);

    // Calculate Global Scale Factor (Votes -> PixelArea)
    // We want Sum(Votes * Factor) = Sum(OriginalPixelArea)
    // So Factor = Sum(OriginalPixelArea) / Sum(Votes)


    // Helper: Calculate Cartogram Layout for a specific year
    // This allows us to pre-calculate layouts in the background
    const calculateLayout = useCallback((targetYear) => {
        if (!mapPaths || !electionData[targetYear] || !window.d3) return null;

        // 1. Calculate Scale Factor for this specific year
        let totalVotes = 0;
        let totalArea = 0;
        mapPaths.forEach(p => {
            const votes = electionData[targetYear][p.id]?.total || 0;
            totalVotes += votes;
            totalArea += p.area;
        });
        const scaleFactor = totalVotes > 0 ? totalArea / totalVotes : 0;
        if (scaleFactor === 0) return null;

        // 2. Create nodes
        const nodes = mapPaths.map(p => {
            const data = electionData[targetYear][p.id];
            const targetArea = (data?.total || 0) * scaleFactor;
            // Radius estimation: Area = pi * r^2  => r = sqrt(Area / pi)
            const r = Math.sqrt(Math.max(0.1, targetArea) / Math.PI);

            return {
                id: p.id,
                x: p.centroid[0],
                y: p.centroid[1],
                rx: p.centroid[0],
                ry: p.centroid[1],
                r: r
            };
        });

        // 3. Run simulation
        const simulation = window.d3.forceSimulation(nodes)
            .force("x", window.d3.forceX(d => d.rx).strength(0.85))
            .force("y", window.d3.forceY(d => d.ry).strength(0.85))
            .force("collide", window.d3.forceCollide(d => d.r + 0.5).strength(1).iterations(3))
            .stop();

        // Run ticks (150 is a good balance for quality/speed)
        for (let i = 0; i < 150; ++i) simulation.tick();

        // 4. Format positions
        const positions = {};
        nodes.forEach(n => {
            positions[n.id] = { x: n.x, y: n.y, r: n.r };
        });

        return positions;
    }, [mapPaths, electionData]);

    // Helper: Calculate Grid Layout (Arrange by Votes)
    const calculateGridLayout = useCallback((targetYear) => {
        if (!mapPaths || !electionData[targetYear]) return null;

        // 1. Calculate Scale Factor (Uses same logic as Cartogram for consistency)
        let totalVotes = 0;
        let totalArea = 0;
        mapPaths.forEach(p => {
            const votes = electionData[targetYear][p.id]?.total || 0;
            totalVotes += votes;
            totalArea += p.area;
        });
        const scaleFactor = totalVotes > 0 ? totalArea / totalVotes : 0;
        if (scaleFactor === 0) return null;

        // 2. Create nodes
        const nodes = mapPaths.map(p => {
            const data = electionData[targetYear][p.id];
            const targetArea = (data?.total || 0) * scaleFactor;
            const r = Math.sqrt(Math.max(0.1, targetArea) / Math.PI);
            return {
                id: p.id,
                r: r,
                votes: data?.total || 0
            };
        });

        // 3. Sort by votes descending
        nodes.sort((a, b) => b.votes - a.votes);

        // 4. Calculate grid dimensions (4:3 Aspect Ratio)
        const totalCircleArea = nodes.reduce((sum, n) => sum + Math.PI * n.r * n.r, 0);
        // Estimate rectangle area (include packing inefficiency ~15%)
        const estimatedTotalArea = totalCircleArea * 1.35;

        // W * H = Area. W / H = 4 / 3 => W = 4/3 * H.
        // 4/3 * H^2 = Area => H = sqrt(Area * 3 / 4)
        const rectHeight = Math.sqrt(estimatedTotalArea * 3 / 4);
        const rectWidth = rectHeight * 4 / 3;

        // 5. Place circles
        const positions = {};
        let x = 0;
        let y = 0;
        let currentRowHeight = 0;
        let maxRowWidth = 0;

        nodes.forEach((node, index) => {
            // Only wrap if not the first item
            if (x + 2 * node.r > rectWidth && index > 0) {
                x = 0;
                y += currentRowHeight;
                currentRowHeight = 0;
            }

            // If wrapping, the new row height is initially this node
            currentRowHeight = Math.max(currentRowHeight, 2 * node.r);

            // If first item in new row
            if (x === 0) {
                currentRowHeight = 2 * node.r;
            }

            // Align vertically to center of current row
            positions[node.id] = {
                x: x + node.r,
                y: y + currentRowHeight / 2,
                r: node.r
            };

            x += 2 * node.r;
            maxRowWidth = Math.max(maxRowWidth, x);
        });


        const finalHeight = y + currentRowHeight;

        // Center the whole block
        const offsetX = (width - maxRowWidth) / 2;
        const offsetY = (height - finalHeight) / 2;

        Object.keys(positions).forEach(id => {
            positions[id].x += offsetX;
            positions[id].y += offsetY;
        });

        return positions;
    }, [mapPaths, electionData]);




    // Helper: Calculate Scatter Layout (Dem vs Rep Axis)
    const calculateScatterLayout = useCallback((targetYear) => {
        if (!mapPaths || !electionData[targetYear] || !window.d3) return null;

        // 1. Calculate Scale Factor for radii
        let totalVotes = 0;
        let totalArea = 0;
        let maxVotes = 0;
        const nodes = [];

        mapPaths.forEach(p => {
            const votes = electionData[targetYear][p.id]?.total || 0;
            totalVotes += votes;
            totalArea += p.area;
            if (votes > maxVotes) maxVotes = votes;
        });
        const scaleFactor = totalVotes > 0 ? totalArea / totalVotes : 0;
        if (scaleFactor === 0) return null;

        // 2. Prepare Nodes
        const W = width;
        const H = height;
        const PADDING_X = 50;
        const CENTER_Y = H / 2;
        const MAX_Y_SPREAD = (H / 2) - 80;

        mapPaths.forEach((p, index) => {
            const data = electionData[targetYear][p.id];
            const votes = data?.total || 0;
            const r = Math.sqrt(Math.max(0.1, votes * scaleFactor) / Math.PI);

            // X Position: Vote Share
            let xRatio = 0.5;
            if (data && (data.demVotes + data.repVotes) > 0) {
                xRatio = data.repVotes / (data.demVotes + data.repVotes);
            }
            const targetX = PADDING_X + xRatio * (W - 2 * PADDING_X);

            // Y Position: Distance from axis based on vote count
            // Smaller votes -> Closer to axis (0). Larger -> Farther (1).
            const normVotes = Math.max(0, Math.min(1, votes / maxVotes));
            const distFactor = Math.sqrt(normVotes);
            // Alternating sides mostly, but allow force to settle
            const side = (index % 2 === 0) ? 1 : -1;
            const targetY = CENTER_Y + side * (distFactor * MAX_Y_SPREAD);

            nodes.push({
                id: p.id,
                r: r,
                x: targetX, // Initial X
                y: targetY, // Initial Y
                targetX: targetX,
                targetY: targetY,
                votes: votes
            });
        });

        // 3. Run Force Simulation Synchronously
        // We use d3-force to resolve collisions and pull towards targets
        const simulation = window.d3.forceSimulation(nodes)
            .force("x", window.d3.forceX(d => d.targetX).strength(2.0)) // High strength to keep vote share accurate
            .force("y", window.d3.forceY(d => d.targetY).strength(0.5)) // Medium strength for Y distribution
            .force("collide", window.d3.forceCollide(d => d.r + 0.5).strength(1).iterations(2))
            .stop();

        // Run ticks manually
        for (let i = 0; i < 40; ++i) simulation.tick();

        // 4. Extract Positions
        const positions = {};
        nodes.forEach(node => {
            positions[node.id] = {
                x: node.x,
                y: node.y,
                r: node.r
            };
        });

        return positions;
    }, [mapPaths, electionData]);


    // Layout Calculation Effect
    useEffect(() => {
        const nearestYear = YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);

        if (layoutMode === LAYOUTS.CARTOGRAM) {
            if (cartogramCache.current[nearestYear]) {
                setLayoutPositions(cartogramCache.current[nearestYear]);
            } else if (window.d3 && mapPaths && electionData[nearestYear]) {
                const layout = calculateLayout(nearestYear);
                if (layout) {
                    cartogramCache.current[nearestYear] = layout;
                    setLayoutPositions(layout);
                }
            }
        } else if (layoutMode === LAYOUTS.GRID) {
            if (gridCache.current[nearestYear]) {
                setLayoutPositions(gridCache.current[nearestYear]);
            } else if (mapPaths && electionData[nearestYear]) {
                const layout = calculateGridLayout(nearestYear);
                if (layout) {
                    gridCache.current[nearestYear] = layout;
                    setLayoutPositions(layout);
                }
            }
        } else if (layoutMode === LAYOUTS.SCATTER) {
            if (scatterCache.current[nearestYear]) {
                setLayoutPositions(scatterCache.current[nearestYear]);
            } else if (mapPaths && electionData[nearestYear]) {
                const layout = calculateScatterLayout(nearestYear);
                if (layout) {
                    scatterCache.current[nearestYear] = layout;
                    setLayoutPositions(layout);
                }
            }
        } else {
            setLayoutPositions(null);
        }
    }, [layoutMode, year, mapPaths, electionData, calculateLayout, calculateGridLayout, calculateScatterLayout]);

    // Background Calculation Effect using Web Workers
    useEffect(() => {
        if (layoutMode !== LAYOUTS.CARTOGRAM || !mapPaths || !window.d3 || Object.keys(electionData).length === 0) return;

        const yearsToProcess = YEARS.filter(y => !cartogramCache.current[y]);

        if (yearsToProcess.length === 0) {
            setCacheProgress({ count: YEARS.length, total: YEARS.length });
            return;
        }

        // Initialize progress display
        // Force 0 immediately if starting fresh to ensure UI feedback
        const initialCompleted = YEARS.length - yearsToProcess.length;
        setCacheProgress({ count: initialCompleted, total: YEARS.length });

        // Prepare simplified geometry for transfer (avoid circular refs or huge unnecessary data)
        const simplifiedMapPaths = mapPaths.map(p => ({
            id: p.id,
            centroid: p.centroid,
            area: p.area
        }));

        // create blob URL for the worker
        const blob = new Blob([CARTOGRAM_WORKER_CODE], { type: "application/javascript" });
        const workerUrl = URL.createObjectURL(blob);

        // Determine concurrency: Use hardware concurrency if available, cap at 6, min 2
        // We want to leave the main thread free but use available cores
        const concurrency = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 2;
        const MAX_WORKERS = Math.max(2, Math.min(concurrency - 1, 6));

        const workers = [];
        let jobIndex = 0;
        let completedJobs = 0;
        let isCancelled = false;

        // Function to create and manage a worker
        const startWorker = () => {
            const worker = new Worker(workerUrl);

            // Initialize geometry once per worker
            worker.postMessage({ type: 'INIT_GEOMETRY', payload: simplifiedMapPaths });

            worker.onmessage = (e) => {
                if (isCancelled) return;

                const { type, year: resultYear, positions, error } = e.data;

                if (type === 'RESULT') {
                    if (positions) {
                        cartogramCache.current[resultYear] = positions;

                        // Live update if viewing this year (or nearest)
                        const nearestYear = YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);
                        if (resultYear === nearestYear && layoutMode === LAYOUTS.CARTOGRAM) {
                            setLayoutPositions(positions);
                        }
                    }

                    // Update progress
                    completedJobs++;
                    setCacheProgress(prev => ({
                        ...prev,
                        count: Math.min(YEARS.length, initialCompleted + completedJobs)
                    }));

                    // Pick next job
                    if (jobIndex < yearsToProcess.length) {
                        dispatchJob(worker);
                    }
                } else if (type === 'ERROR') {
                    console.error(`Worker error for year ${resultYear}:`, error);
                    // Still mark as complete to avoid hanging
                    completedJobs++;
                    setCacheProgress(prev => ({ ...prev, count: initialCompleted + completedJobs }));
                    if (jobIndex < yearsToProcess.length) dispatchJob(worker);
                }
            };

            worker.onerror = (err) => {
                console.error("Worker initialization error:", err);
                // Mark job as done (with error) to prevent blocking
                completedJobs++;
                setCacheProgress(prev => ({
                    ...prev,
                    // Force progress to avoid 0 stuck
                    count: Math.min(YEARS.length, initialCompleted + completedJobs)
                }));
                // Try next job
                if (jobIndex < yearsToProcess.length) dispatchJob(worker);
            };

            return worker;
        };

        // Dispatch job to worker
        const dispatchJob = (worker) => {
            if (jobIndex >= yearsToProcess.length) return;

            const targetYear = yearsToProcess[jobIndex];
            jobIndex++;

            worker.postMessage({
                type: 'CALCULATE_YEAR',
                payload: {
                    year: targetYear,
                    electionDataForYear: electionData[targetYear]
                }
            });
        };

        // Start workers (pool size)
        const numWorkersToStart = Math.min(yearsToProcess.length, MAX_WORKERS);
        for (let i = 0; i < numWorkersToStart; i++) {
            const w = startWorker();
            workers.push(w);
            dispatchJob(w);
        }

        return () => {
            isCancelled = true;
            workers.forEach(w => w.terminate());
            URL.revokeObjectURL(workerUrl);
        };
    }, [layoutMode, mapPaths, electionData]); // Updated dependency to layoutMode

    const getColor = useCallback((fips) => {
        const data = getInterpolatedData(fips, year);
        if (!data) return isDarkMode ? '#1e293b' : '#e5e7eb';

        // Calculate three-way vote shares (normalized to sum to 1)
        const dem = data.demVotes || 0;
        const rep = data.repVotes || 0;
        const third = data.thirdVotes || 0;
        const total = dem + rep + third;

        if (total === 0) return isDarkMode ? '#1e293b' : '#e5e7eb';

        // Normalized shares (barycentric coordinates)
        const demWeight = dem / total;
        const repWeight = rep / total;
        const thirdWeight = third / total;

        if (mode === 'winner') {
            // Winner-take-all: show color of party with most votes
            if (demWeight > repWeight && demWeight > thirdWeight) {
                return isDarkMode ? PARTIES.DEM.darkColor : PARTIES.DEM.color;
            } else if (repWeight > demWeight && repWeight > thirdWeight) {
                return isDarkMode ? PARTIES.REP.darkColor : PARTIES.REP.color;
            } else if (thirdWeight > demWeight && thirdWeight > repWeight) {
                return isDarkMode ? PARTIES.THIRD.darkColor : PARTIES.THIRD.color;
            }
            // Tie-breaker: Dem > Rep > Third
            return demWeight >= repWeight
                ? (isDarkMode ? PARTIES.DEM.darkColor : PARTIES.DEM.color)
                : (isDarkMode ? PARTIES.REP.darkColor : PARTIES.REP.color);
        } else {
            // Ternary gradient using barycentric interpolation with purple center
            if (window.d3) {
                // For balanced votes (near center), blend towards purple
                const centerColor = '#800080'; // Purple

                // Calculate distance from center (equal thirds)
                const centerDistance = Math.abs(demWeight - 0.333) + Math.abs(repWeight - 0.333) + Math.abs(thirdWeight - 0.333);
                const centerWeight = Math.max(0, 1 - (centerDistance * 1.5)); // Stronger near center

                // Convert hex colors to RGB
                const demRgb = window.d3.rgb(isDarkMode ? PARTIES.DEM.darkColor : PARTIES.DEM.color);
                const repRgb = window.d3.rgb(isDarkMode ? PARTIES.REP.darkColor : PARTIES.REP.color);
                const thirdRgb = window.d3.rgb(isDarkMode ? PARTIES.THIRD.darkColor : PARTIES.THIRD.color);
                const centerRgb = window.d3.rgb(centerColor);

                // Weighted average of RGB components
                let r = demRgb.r * demWeight + repRgb.r * repWeight + thirdRgb.r * thirdWeight;
                let g = demRgb.g * demWeight + repRgb.g * repWeight + thirdRgb.g * thirdWeight;
                let b = demRgb.b * demWeight + repRgb.b * repWeight + thirdRgb.b * thirdWeight;

                // Blend with purple at center
                if (centerWeight > 0) {
                    r = r * (1 - centerWeight) + centerRgb.r * centerWeight;
                    g = g * (1 - centerWeight) + centerRgb.g * centerWeight;
                    b = b * (1 - centerWeight) + centerRgb.b * centerWeight;
                }

                return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
            }
            // Fallback
            return demWeight > repWeight
                ? (isDarkMode ? PARTIES.DEM.darkColor : PARTIES.DEM.color)
                : (isDarkMode ? PARTIES.REP.darkColor : PARTIES.REP.color);
        }
    }, [getInterpolatedData, year, mode, isDarkMode]);

    // Non-passive wheel listener for global scroll blocking and zooming
    useEffect(() => {
        // Ensure body doesn't scroll
        document.body.style.overflow = 'hidden';

        const handleGlobalWheel = (e) => {
            e.preventDefault(); // Disable default scrolling everywhere

            const svg = svgRef.current;
            if (!svg) return;

            // 1. Convert Screen Coordinates (Pixels) to SVG User Coordinates (ViewBox Units)
            // This handles any scaling/letterboxing done by the browser automatically.
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;

            let cursorPoint;
            try {
                cursorPoint = pt.matrixTransform(svg.getScreenCTM().inverse());
            } catch (err) {
                return; // Screen CTM might not be ready
            }

            const offsetX = cursorPoint.x;
            const offsetY = cursorPoint.y;

            // Sensitivity factor (increased for better responsiveness)
            const scaleChange = -e.deltaY * 0.002;

            setViewState(prev => {
                const newK = Math.min(3.75, Math.max(0.5, prev.k * (1 + scaleChange)));
                // Avoid division by zero or tiny changes
                if (Math.abs(newK - prev.k) < 0.0001) return prev;

                const kRatio = newK / prev.k;
                return {
                    k: newK,
                    x: offsetX - (offsetX - prev.x) * kRatio,
                    y: offsetY - (offsetY - prev.y) * kRatio
                };
            });
        };

        // Attach to window to capture and block all scroll events
        window.addEventListener('wheel', handleGlobalWheel, { passive: false });

        return () => {
            window.removeEventListener('wheel', handleGlobalWheel);
            document.body.style.overflow = '';
        };
    }, [svgRef]);

    const handleMouseDown = (e) => {
        e.target.setPointerCapture(e.pointerId);
        setIsDragging(true);
        setDragStart({ x: e.clientX - viewState.x, y: e.clientY - viewState.y });
    };

    const handleMouseDrag = (e) => {
        if (!isDragging) return;
        setViewState(prev => ({
            ...prev,
            x: e.clientX - dragStart.x,
            y: e.clientY - dragStart.y
        }));
    };

    const handleMouseUp = (e) => {
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
    };

    // Optimization: Use ref for viewState to avoid re-creating handleMouseMove on every frame
    const viewStateRef = useRef(viewState);
    useEffect(() => { viewStateRef.current = viewState; }, [viewState]);

    const handleMouseMove = useCallback((e, feature) => {
        if (!electionData || !svgRef.current || !feature) return;

        // Use Centroid of the feature for stable tooltip positioning regardless of zoom
        const pathItem = mapPaths?.find(p => p.id === feature.id);
        if (!pathItem) return;

        let mx = pathItem.centroid[0];
        let my = pathItem.centroid[1];

        // Check if we are in Layout Mode (Circle) AND have a cached position for this year
        const nearestYear = YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);

        if (layoutMode !== LAYOUTS.GEO && layoutPositions && layoutPositions[feature.id]) {
            const pos = layoutPositions[feature.id];
            mx = pos.x;
            my = pos.y;
        }

        setHovered({
            id: feature.id,
            name: feature.properties.name || `County ${feature.id}`,
            mx,
            my
        });
    }, [electionData, mapPaths, layoutMode, layoutPositions, year]);

    // Touch / Pinch-to-Zoom Handlers
    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const cx = (t1.clientX + t2.clientX) / 2;
            const cy = (t1.clientY + t2.clientY) / 2;

            touchRef.current = {
                mode: 'pinch',
                startDist: dist,
                startCx: cx,
                startCy: cy,
                startK: viewState.k,
                startX: viewState.x,
                startY: viewState.y
            };

            // Disable dragging if pinch starts
            setIsDragging(false);
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && touchRef.current.mode === 'pinch') {
            e.preventDefault(); // Prevent browser zoom and pointer events

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const cx = (t1.clientX + t2.clientX) / 2;
            const cy = (t1.clientY + t2.clientY) / 2;

            const { startDist, startCx, startCy, startK, startX, startY } = touchRef.current;

            // Calculate new scale
            const scale = dist / startDist;
            const newK = Math.min(3.75, Math.max(0.5, startK * scale));

            // Calculate effective scale ratio relative to start
            const effectiveScaleRatio = newK / startK;

            // Calculate new translation to keep the point under the centroid fixed relative to the map
            // New position = CurrentCentroid - (StartCentroid - StartPos) * Ratio
            const newX = cx - (startCx - startX) * effectiveScaleRatio;
            const newY = cy - (startCy - startY) * effectiveScaleRatio;

            setViewState({
                k: newK,
                x: newX,
                y: newY
            });
        }
    };

    const handleTouchEnd = () => {
        touchRef.current = { mode: null };
    };

    // Optimization: Memoize map content to avoid re-renders on hover
    const mapContent = useMemo(() => {
        // Find nearest integer year for geometry snapping
        const nearestYear = YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);

        return mapPaths?.map((pathItem) => {
            if (layoutMode !== LAYOUTS.GEO && layoutPositions) {
                // Use positions from current layout
                const positions = layoutPositions; // This is already the correct year set from effect

                if (positions && positions[pathItem.id]) {
                    const pos = positions[pathItem.id];
                    const strokeWidth = showBorders ? (0.5 / pos.r) : 0;
                    return (
                        <circle
                            key={pathItem.id}
                            cx={pos.x.toFixed(2)}
                            cy={pos.y.toFixed(2)}
                            r={pos.r.toFixed(2)}
                            fill={getColor(pathItem.id)}
                            stroke={showBorders ? (isDarkMode ? "#334155" : "#cbd5e1") : "none"}
                            strokeWidth={strokeWidth}
                            className="hover:opacity-90 transition-colors duration-200"
                            onMouseEnter={(e) => handleMouseMove(e, pathItem.feature)}
                            onMouseLeave={() => setHovered(null)}
                        />
                    );
                }
            }

            return (
                <path
                    key={pathItem.id}
                    d={pathItem.d}
                    fill={getColor(pathItem.id)}
                    stroke={showBorders ? (isDarkMode ? "#334155" : "#cbd5e1") : "none"}
                    strokeWidth={0.5}
                    className="hover:opacity-90 transition-colors duration-200"
                    onMouseEnter={(e) => handleMouseMove(e, pathItem.feature)}
                    onMouseLeave={() => setHovered(null)}
                />
            );
        });
    }, [mapPaths, layoutMode, layoutPositions, showBorders, isDarkMode, getColor, handleMouseMove, year]);

    // --- Render ---

    const playButton = (
        <button
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={Object.keys(electionData).length === 0}
            className={`flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full transition shadow-lg focus:outline-none ${Object.keys(electionData).length === 0 ? 'opacity-50 cursor-not-allowed bg-slate-500' : (isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-slate-900 text-white hover:bg-slate-800')}`}
        >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
        </button>
    );

    const prevButton = (
        <button
            onClick={() => { setIsPlaying(false); setYear(prev => Math.max(YEARS[0], prev - 0.1)); }}
            disabled={Object.keys(electionData).length === 0}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}
        >
            <ChevronLeft size={18} />
        </button>
    );

    const nextButton = (
        <button
            onClick={() => { setIsPlaying(false); setYear(prev => Math.min(YEARS[YEARS.length - 1], prev + 0.1)); }}
            disabled={Object.keys(electionData).length === 0}
            className={`p-2 rounded-full transition-colors ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}
        >
            <ChevronRight size={18} />
        </button>
    );

    const sliderSection = (
        <div className="flex-1 relative mx-2">
            <div className={`flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider shadow-sm ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                {!isMobile && <span>{YEARS[0]}</span>}
                <span className={`text-xl -mt-2 drop-shadow-sm ${isDarkMode ? 'text-slate-200' : 'text-slate-900'} ${isMobile ? 'mx-auto' : ''}`}>
                    {YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev)}
                </span>
                {!isMobile && <span>{YEARS[YEARS.length - 1]}</span>}
                {/* Loading Indicator */}
                {cacheProgress.count < cacheProgress.total && layoutMode === LAYOUTS.CARTOGRAM && (
                    <span className={`text-[10px] animate-pulse ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                        (Optimizing: {Math.round((cacheProgress.count / cacheProgress.total) * 100)}%)
                    </span>
                )}
            </div>
            <input
                type="range"
                min={YEARS[0]}
                max={YEARS[YEARS.length - 1]}
                step="0.1" // Allow smooth sliding
                disabled={Object.keys(electionData).length === 0}
                value={year}
                onPointerUp={() => {
                    // Snap on drag end
                    const nearest = YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);
                    setYear(nearest);
                }}
                onChange={(e) => { setIsPlaying(false); setYear(parseFloat(e.target.value)); }}
                className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isDarkMode ? 'bg-slate-700 accent-blue-500' : 'bg-slate-300 accent-slate-900'}`}
            />
            {!isMobile && (
                <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    {YEARS.map(y => (
                        <span key={y} className={`cursor-pointer hover:text-blue-500 transition-colors ${Math.abs(y - year) < 2 ? 'font-bold text-blue-500' : ''}`} onClick={() => { setIsPlaying(false); setYear(y); }}>{y}</span>
                    ))}
                </div>
            )}
        </div>
    );

    const timelineControls = isMobile ? (
        // Mobile Layout: Side-by-Side
        <div className="w-full flex items-center gap-2 pointer-events-auto px-1">
            <div className="flex-shrink-0">
                {playButton}
            </div>
            {sliderSection}
        </div>
    ) : (
        // Desktop Layout: Single Row
        <div className="w-full max-w-4xl flex flex-col gap-3 pointer-events-auto">
            <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1">
                    {playButton}
                </div>
                {prevButton}
                {sliderSection}
                {nextButton}
            </div>
        </div>
    );


    if (d3Status !== 'ready' || topoStatus !== 'ready' || dataStatus === 'loading') {
        return (
            <div className={`flex h-screen w-full items-center justify-center font-sans ${isDarkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p>{dataStatus === 'loading' ? 'Loading Dataset...' : 'Initializing Engine...'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`h-screen w-full font-sans relative overflow-hidden flex flex-col transition-colors duration-300 ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>

            {/* 1. Map Layer */}
            <div
                ref={mapRef}
                className={`absolute inset-0 flex items-center justify-center transition-colors duration-300 ${isDarkMode ? 'bg-slate-950' : 'bg-slate-200'} cursor-grab ${isDragging ? 'cursor-grabbing' : ''} touch-none`}
                onPointerDown={handleMouseDown}
                onPointerMove={handleMouseDrag}
                onPointerUp={handleMouseUp}
                onPointerLeave={() => setIsDragging(false)}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
            >
                {topology ? (
                    <svg
                        ref={svgRef}
                        viewBox={`0 0 ${width} ${height}`}
                        className="w-full h-full max-h-screen max-w-none"
                    >
                        <g style={{ transform: `translate(${viewState.x}px, ${viewState.y}px) scale(${viewState.k})`, transformOrigin: '0 0' }}>
                            {mapContent}

                            {/* State Borders */}
                            {layoutMode === LAYOUTS.GEO && (
                                <path
                                    d={window.d3.geoPath().projection(window.d3.geoAlbersUsa().scale(1000).translate([width / 2, height / 2]))(
                                        window.topojson.mesh(topology, topology.objects.states, (a, b) => a !== b)
                                    )}
                                    fill="none"
                                    stroke={isDarkMode ? "#334155" : "#fff"}
                                    strokeWidth="0.8"
                                    strokeOpacity="0.5"
                                    className="pointer-events-none transition-colors duration-300"
                                />
                            )}

                            {/* Highlight Overlay */}
                            {hovered && hovered.id && (() => {
                                const p = mapPaths?.find(x => x.id === hovered.id);
                                if (!p) return null;
                                // Use nearest year for geometry highlight
                                const nearestYear = YEARS.reduce((prev, curr) => Math.abs(curr - year) < Math.abs(prev - year) ? curr : prev);
                                if (layoutMode !== LAYOUTS.GEO && layoutPositions && layoutPositions[p.id]) {
                                    const pos = layoutPositions[p.id];
                                    return <circle cx={pos.x} cy={pos.y} r={pos.r} fill="none" stroke={isDarkMode ? "#fff" : "#000"} strokeWidth={2 / pos.r} className="pointer-events-none" />;
                                }
                                return <path d={p.d} fill="none" stroke={isDarkMode ? "#fff" : "#000"} strokeWidth={2} className="pointer-events-none" />;
                            })()}
                        </g>
                    </svg>
                ) : (
                    <div className="text-slate-400">Loading Map Data...</div>
                )}
            </div>







            {/* 3. Title Overlay */}
            <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10 pointer-events-none">
                <div className={`pointer-events-auto ${isMobile ? 'w-[90vw]' : 'max-w-sm'}`}>
                    <div className="flex items-center gap-3">
                        <h1 className={`text-2xl font-bold tracking-tight leading-tight drop-shadow-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                            U.S. Election History
                        </h1>
                        <a href="https://github.com/keonjoe/election_viewer/" target="_blank" rel="noopener noreferrer" className={`transition-colors ${isDarkMode ? 'text-slate-400 hover:text-blue-400' : 'text-slate-500 hover:text-blue-600'}`}>
                            <Github size={18} />
                        </a>
                    </div>
                    <p className={`mt-1 text-xs flex gap-2 leading-relaxed font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <Info size={14} className="shrink-0 mt-0.5" />
                        Visualization by County (2000 - 2024)
                    </p>
                    <div className={`text-[10px] mt-2 font-mono uppercase tracking-wide flex items-center gap-2 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${Object.keys(electionData).length > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                        {Object.keys(electionData).length > 0 ? (
                            <a href="https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/VOQCHQ" target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-emerald-500 transition-colors">
                                Data: MIT Election Data & Science Lab
                            </a>
                        ) : 'Waiting for Data...'}
                    </div>

                    {/* Mobile Timeline Controls */}
                    {isMobile && <div className="mt-4 pointer-events-auto scale-90 origin-top-left -ml-2">{timelineControls}</div>}

                    {/* Register to Vote Button (Desktop) */}
                    <div className="mt-4 hidden md:block">
                        <a
                            href="https://vote.gov"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs shadow-md transition-all border backdrop-blur-md ${isDarkMode
                                ? 'bg-slate-700/50 hover:bg-slate-600/70 text-slate-100 border-slate-600/50'
                                : 'bg-slate-600/70 hover:bg-slate-700/80 text-white border-slate-500/50'
                                }`}
                        >
                            <span className="text-base">🇺🇸</span>
                            <span>Register to Vote</span>
                        </a>
                    </div>
                </div>
            </div>

            {/* Mobile Register Button (Top Right) */}
            <div className="absolute top-4 right-4 z-10 md:hidden pointer-events-auto">
                <a
                    href="https://vote.gov"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs shadow-md transition-all border backdrop-blur-md ${isDarkMode
                        ? 'bg-slate-700/50 hover:bg-slate-600/70 text-slate-100 border-slate-600/50'
                        : 'bg-slate-600/70 hover:bg-slate-700/80 text-white border-slate-500/50'
                        }`}
                >
                    <span className="text-base">🇺🇸</span>
                    <span>Register to Vote</span>
                </a>
            </div>

            {/* 4. Controls & Legend */}
            <div className="absolute z-10 pointer-events-none flex flex-row md:flex-col items-end gap-2 bottom-2 left-4 right-4 md:bottom-auto md:left-auto md:top-6 md:right-6 origin-bottom-left md:origin-top-right scale-90 md:scale-100 flex-wrap overflow-visible pr-2 md:pr-0">
                {/* Header Group (Legend + Link) */}
                <div className="flex flex-row items-end md:items-start gap-2 shrink-0">
                    {/* Legend - Order 1 Mobile, Order 2 Desktop */}
                    <div className={`order-1 md:order-2 flex items-center gap-3 text-xs pointer-events-auto p-2 rounded-xl backdrop-blur-sm border shadow-sm shrink-0 md:w-32 md:justify-center ${isDarkMode ? 'bg-slate-900/50 border-slate-700 text-slate-300' : 'bg-white/50 border-slate-200 text-slate-600'}`}>
                        <TriangleLegend isDarkMode={isDarkMode} mode={mode} />
                    </div>

                    {/* Color Mode Toggle - Order 2 Mobile, Order 1 Desktop */}
                    <div className={`order-2 md:order-1 pointer-events-auto flex flex-col rounded-lg p-1 shadow-lg border shrink-0 ${isDarkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/80 border-slate-200'}`}>
                        <button
                            onClick={() => { setMode('winner'); setShowBorders(true); }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all ${mode === 'winner'
                                ? (isDarkMode ? 'bg-blue-600 text-white shadow-md' : 'bg-blue-500 text-white shadow-md')
                                : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                                }`}
                        >
                            <MapIcon size={14} />
                            <span>Winner</span>
                        </button>
                        <button
                            onClick={() => { setMode('gradient'); setShowBorders(false); }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all ${mode === 'gradient'
                                ? (isDarkMode ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-500 text-white shadow-md')
                                : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600 hover:text-slate-900')
                                }`}
                        >
                            <Layers size={14} />
                            <span>Vote %</span>
                        </button>
                    </div>
                </div>

                {/* View Mode Menu */}
                <div className={`pointer-events-auto relative shrink-0 z-20 md:w-32`}>
                    <button
                        onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-md border w-full h-[40px] md:h-auto ${layoutMode !== LAYOUTS.GEO
                            ? (isDarkMode ? 'bg-indigo-900/80 border-indigo-500 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-600')
                            : (isDarkMode ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-800' : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-white backdrop-blur-sm')
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            {layoutMode === LAYOUTS.GEO && <Globe size={16} />}
                            {layoutMode === LAYOUTS.CARTOGRAM && <Maximize2 size={16} />}
                            {layoutMode === LAYOUTS.GRID && <LayoutGrid size={16} />}
                            {layoutMode === LAYOUTS.SCATTER && <ScatterChart size={16} />}

                            <span className="md:inline hidden">
                                {layoutMode === LAYOUTS.GEO ? 'Geography' :
                                    (layoutMode === LAYOUTS.CARTOGRAM ? 'Size by Votes' :
                                        (layoutMode === LAYOUTS.GRID ? 'Arrange by Votes' : 'Vote Spectrum'))}
                            </span>
                            <span className="md:hidden inline">
                                {layoutMode === LAYOUTS.GEO ? 'Geo' : (layoutMode === LAYOUTS.CARTOGRAM ? 'Size' : (layoutMode === LAYOUTS.GRID ? 'Grid' : 'Axis'))}
                            </span>
                        </div>
                        {isLayoutMenuOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>

                    {/* Dropdown Menu */}
                    {isLayoutMenuOpen && (
                        <div className={`${isMobile
                            ? 'fixed bottom-[160px] left-4 right-4 z-[100] w-auto shadow-2xl touch-none'
                            : 'absolute bottom-full left-0 mb-2 w-48 md:bottom-auto md:top-full md:mt-2 shadow-xl'} rounded-xl border overflow-hidden backdrop-blur-md flex flex-col ${isDarkMode ? 'bg-slate-900/95 border-slate-700' : 'bg-white/95 border-slate-200'}`}>
                            {[
                                { id: LAYOUTS.GEO, label: 'Geography', icon: Globe, desc: 'Standard Map' },
                                { id: LAYOUTS.CARTOGRAM, label: 'Size by Votes', icon: Maximize2, desc: 'Dorling Cartogram' },
                                { id: LAYOUTS.GRID, label: 'Arrange by Votes', icon: LayoutGrid, desc: 'Sorted Grid' },
                                { id: LAYOUTS.SCATTER, label: 'Vote Spectrum', icon: ScatterChart, desc: 'Dem vs Rep Axis' }
                            ].map((opt) => (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        setLayoutMode(opt.id);
                                        setIsLayoutMenuOpen(false);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-3 text-left transition-colors ${layoutMode === opt.id
                                        ? (isDarkMode ? 'bg-indigo-900/50 text-indigo-300' : 'bg-indigo-50 text-indigo-600')
                                        : (isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50')
                                        }`}
                                >
                                    <opt.icon size={16} className={layoutMode === opt.id ? 'text-current' : (isDarkMode ? 'text-slate-500' : 'text-slate-400')} />
                                    <div>
                                        <div className="text-xs font-bold">{opt.label}</div>
                                        <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{opt.desc}</div>
                                    </div>
                                    {layoutMode === opt.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-current"></div>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Dark Mode & Borders Stack */}
                <div className="flex flex-col gap-1.5 pointer-events-auto shrink-0 md:w-32">
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-md border w-full ${isDarkMode
                            ? 'bg-slate-800 border-slate-600 text-yellow-400 hover:bg-slate-700'
                            : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-white backdrop-blur-sm'
                            }`}
                    >
                        {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
                        <span className="hidden md:inline">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</span>
                    </button>

                    <button
                        onClick={() => setShowBorders(!showBorders)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-md border w-full ${showBorders
                            ? (isDarkMode ? 'bg-slate-800 border-slate-600 text-indigo-400 hover:bg-slate-700' : 'bg-white/80 border-slate-200 text-indigo-600 hover:bg-white backdrop-blur-sm')
                            : (isDarkMode ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-800' : 'bg-white/60 border-transparent text-slate-500 hover:bg-white backdrop-blur-sm')
                            }`}
                    >
                        {showBorders ? <Eye size={14} /> : <EyeOff size={14} />}
                        <span className="hidden md:inline">{showBorders ? 'Hide Borders' : 'See Borders'}</span>
                    </button>
                </div>
            </div >



            {/* 5. Timeline Overlay (Desktop Only) */}
            {!isMobile && (
                <div className="absolute bottom-12 md:bottom-8 left-0 right-0 z-10 px-2 md:px-4 flex justify-center pointer-events-none">
                    {timelineControls}
                </div>
            )}

            {/* Floating Tooltip */}
            {hovered && (() => {
                const hoveredData = getInterpolatedData(hovered.id, year);
                const svg = svgRef.current;

                if (!hoveredData || !svg) return null;

                // 1. Map Space -> SVG User Space (apply pan/zoom)
                const svgX = hovered.mx * viewState.k + viewState.x;
                const svgY = hovered.my * viewState.k + viewState.y;

                // 2. SVG User Space -> Screen Pixels
                let screenX, screenY;
                try {
                    let pt = svg.createSVGPoint();
                    pt.x = svgX;
                    pt.y = svgY;
                    const screenP = pt.matrixTransform(svg.getScreenCTM());
                    screenX = screenP.x;
                    screenY = screenP.y;
                } catch (err) {
                    return null;
                }

                // Smart Positioning logic
                const tooltipWidth = 240; // Approx max width
                const tooltipHeight = 300; // Approx max height
                const margin = 20;

                // Default: Bottom-Right
                let left = screenX + margin;
                let top = screenY + margin; // Start below cursor

                // Check Right Edge -> Flip to Left
                if (left + tooltipWidth > window.innerWidth) {
                    left = screenX - tooltipWidth - margin;
                }

                // Check Bottom Edge -> Flip to Top
                if (top + tooltipHeight > window.innerHeight) {
                    top = screenY - tooltipHeight - margin;
                    if (top < 0) top = 10;
                }

                return (
                    <div
                        className={`absolute z-50 pointer-events-none backdrop-blur shadow-2xl rounded-xl p-4 text-sm border w-56 transition-colors ${isDarkMode
                            ? 'bg-slate-900/95 border-slate-700 text-slate-200'
                            : 'bg-white/95 border-slate-100 text-slate-800'
                            }`}
                        style={{ left: left, top: top }}
                    >
                        <div className={`font-bold mb-3 pb-2 border-b flex justify-between items-center ${isDarkMode ? 'border-slate-700 text-slate-100' : 'border-slate-100 text-slate-800'}`}>
                            <span>{hovered.name}{STATE_FIPS_MAP[String(hovered.id).padStart(5, '0').substring(0, 2)] ? `, ${STATE_FIPS_MAP[String(hovered.id).padStart(5, '0').substring(0, 2)]}` : ''}</span>
                            <span className={`text-xs font-normal ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{Math.round(year)}</span>
                        </div>
                        {hoveredData ? (
                            <div className="space-y-2.5">
                                <div>
                                    <div className="flex justify-between items-center text-xs font-bold text-blue-500 mb-1">
                                        <span>Democrat</span>
                                        <span>{((hoveredData.demVotes / (hoveredData.demVotes + hoveredData.repVotes + hoveredData.thirdVotes)) * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className={`w-full h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                        <div className="h-full bg-blue-500" style={{ width: `${(hoveredData.demVotes / (hoveredData.demVotes + hoveredData.repVotes + hoveredData.thirdVotes)) * 100}%` }}></div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between items-center text-xs font-bold text-red-500 mb-1">
                                        <span>Republican</span>
                                        <span>{((hoveredData.repVotes / (hoveredData.demVotes + hoveredData.repVotes + hoveredData.thirdVotes)) * 100).toFixed(1)}%</span>
                                    </div>
                                    <div className={`w-full h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                        <div className="h-full bg-red-500" style={{ width: `${(hoveredData.repVotes / (hoveredData.demVotes + hoveredData.repVotes + hoveredData.thirdVotes)) * 100}%` }}></div>
                                    </div>
                                </div>

                                {/* Third Party Votes */}
                                {hoveredData.thirdVotes > 0 && (
                                    <div>
                                        <div className="flex justify-between items-center text-xs font-bold text-emerald-500 mb-1">
                                            <span>Third Party</span>
                                            <span>{((hoveredData.thirdVotes / (hoveredData.demVotes + hoveredData.repVotes + hoveredData.thirdVotes)) * 100).toFixed(1)}%</span>
                                        </div>
                                        <div className={`w-full h-2 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                            <div className="h-full bg-emerald-500" style={{ width: `${(hoveredData.thirdVotes / (hoveredData.demVotes + hoveredData.repVotes + hoveredData.thirdVotes)) * 100}%` }}></div>
                                        </div>
                                        {/* Show up to 2 third-party candidates */}
                                        {(hoveredData.thirdParty1 || hoveredData.thirdParty2) && (
                                            <div className={`mt-1.5 text-[10px] space-y-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {hoveredData.thirdParty1 && (
                                                    <div className="flex justify-between">
                                                        <span className="truncate mr-2">{hoveredData.thirdParty1.name} ({hoveredData.thirdParty1.party})</span>
                                                        <span className="font-mono">{hoveredData.thirdParty1.votes.toLocaleString()}</span>
                                                    </div>
                                                )}
                                                {hoveredData.thirdParty2 && hoveredData.thirdParty2.votes > 0 && (
                                                    <div className="flex justify-between">
                                                        <span className="truncate mr-2">{hoveredData.thirdParty2.name} ({hoveredData.thirdParty2.party})</span>
                                                        <span className="font-mono">{hoveredData.thirdParty2.votes.toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Vote History Chart */}
                                <div className="mt-3 mb-2 pt-2 border-t border-dashed border-slate-300 dark:border-slate-700">
                                    <div className={`text-[10px] font-semibold mb-1 uppercase tracking-wider ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Vote History</div>
                                    <div className="h-16 w-full">
                                        {(() => {
                                            const history = YEARS.map(y => {
                                                const d = electionData[y]?.[hovered.id];
                                                return {
                                                    dem: d ? d.demVotes : 0,
                                                    rep: d ? d.repVotes : 0,
                                                    third: d ? d.thirdVotes : 0
                                                };
                                            });
                                            const maxVote = Math.max(...history.map(h => Math.max(h.dem, h.rep, h.third)), 1);
                                            const points = (type) => history.map((d, i) => {
                                                const x = (i / (history.length - 1)) * 200;
                                                const val = type === 'dem' ? d.dem : type === 'rep' ? d.rep : d.third;
                                                const y = 60 - ((val / maxVote) * 60);
                                                return `${x},${y}`;
                                            }).join(' ');

                                            // Use current interpolated data for the dot
                                            const currX = ((year - YEARS[0]) / (YEARS[YEARS.length - 1] - YEARS[0])) * 200;
                                            const currDemY = 60 - ((hoveredData.demVotes / maxVote) * 60);
                                            const currRepY = 60 - ((hoveredData.repVotes / maxVote) * 60);
                                            const currThirdY = 60 - ((hoveredData.thirdVotes / maxVote) * 60);

                                            return (
                                                <svg viewBox="0 -5 200 70" className="w-full h-full overflow-visible">
                                                    <polyline fill="none" stroke={PARTIES.DEM.color} strokeWidth="2" points={points('dem')} strokeLinecap="round" strokeLinejoin="round" />
                                                    <polyline fill="none" stroke={PARTIES.REP.color} strokeWidth="2" points={points('rep')} strokeLinecap="round" strokeLinejoin="round" />
                                                    <polyline fill="none" stroke={PARTIES.THIRD.color} strokeWidth="2" points={points('third')} strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
                                                    <circle cx={currX} cy={currDemY} r="3" fill={PARTIES.DEM.color} stroke={isDarkMode ? '#0f172a' : '#fff'} strokeWidth="1.5" />
                                                    <circle cx={currX} cy={currRepY} r="3" fill={PARTIES.REP.color} stroke={isDarkMode ? '#0f172a' : '#fff'} strokeWidth="1.5" />
                                                    {hoveredData.thirdVotes > 0 && <circle cx={currX} cy={currThirdY} r="3" fill={PARTIES.THIRD.color} stroke={isDarkMode ? '#0f172a' : '#fff'} strokeWidth="1.5" />}
                                                </svg>
                                            );
                                        })()}
                                    </div>
                                </div>

                                <div className={`text-xs pt-2 flex justify-between ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    <span>Total Votes (Est)</span>
                                    <span className="font-mono">{Math.round(hoveredData.total).toLocaleString()}</span>
                                </div>
                            </div>
                        ) : (
                            <div className={`text-xs italic ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>No Data Available</div>
                        )}
                    </div>
                );
            })()
            }

            {/* Blocking Cache Generation Overlay */}
            {
                cacheProgress.count < cacheProgress.total && layoutMode === LAYOUTS.CARTOGRAM && (
                    <div className="absolute inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white pointer-events-auto cursor-wait">
                        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-6"></div>
                            <h2 className="text-xl font-bold mb-2">Generating Cache</h2>
                            <p className="text-slate-400 text-sm mb-6">Optimizing complex geometry for smooth interactions...</p>

                            <div className="text-4xl font-bold text-blue-400 mb-2">
                                {Math.round((cacheProgress.count / cacheProgress.total) * 100)}%
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                                {cacheProgress.count} / {cacheProgress.total} elections
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}