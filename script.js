const PLANETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=416114984&single=true&output=csv';
const CONNECTIONS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTVPQVMnjZWNBWkWkebK4aCnYi3PhsewOGOaxSLfx0Fj2ZYc6tYkSS4iNoV8tWKEj22YEn8ysYE6kgl/pub?gid=1688125961&single=true&output=csv';

const svg = document.getElementById('starmap');
const mapGroup = document.getElementById('map-group'); // Контейнер для трансформаций
const tooltip = document.getElementById('tooltip');
const ttTitle = document.getElementById('tt-title');
const ttInfo = document.getElementById('tt-info');
const ttFaction = document.getElementById('tt-faction');
const hoverTooltip = document.getElementById('hover-tooltip');

// --- Переменные для камеры (зум и панорамирование) ---
let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;

// 1. Движение камеры (перетаскивание ЛКМ)
svg.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

// 2. Масштабирование (колесико мыши)
svg.addEventListener('wheel', (e) => {
    e.preventDefault(); // Отключаем стандартный скролл страницы

    const zoomIntensity = 0.1;
    const wheel = e.deltaY < 0 ? 1 : -1;
    const zoomFactor = Math.exp(wheel * zoomIntensity);

    const rect = svg.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let newScale = scale * zoomFactor;
    // Ограничиваем масштаб (от 0.3x до 5x)
    newScale = Math.max(0.3, Math.min(newScale, 5));
    const actualZoomFactor = newScale / scale;

    // Математика для зума в точку под курсором
    translateX = mouseX - (mouseX - translateX) * actualZoomFactor;
    translateY = mouseY - (mouseY - translateY) * actualZoomFactor;
    scale = newScale;

    updateTransform();
}, { passive: false });

function updateTransform() {
    mapGroup.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${scale})`);
}

function fetchCSV(url) {
    return new Promise((resolve, reject) => {
        Papa.parse(url, {
            download: true,
            header: true,
            complete: results => resolve(results.data),
            error: err => reject(err)
        });
    });
}

async function initMap() {
    try {
        const [planetsData, connectionsData] = await Promise.all([
            fetchCSV(PLANETS_CSV_URL),
            fetchCSV(CONNECTIONS_CSV_URL)
        ]);

        const planets = planetsData.filter(p => p.id);
        const connections = connectionsData.filter(c => c.from && c.to);
        const planetMap = {};
        planets.forEach(p => planetMap[p.id] = p);

        // --- 4. Отрисовка сетки (в самом низу) ---
        const cols = 16; // по горизонтали
        const rows = 18; // по вертикали

        for (let i = 0; i <= cols; i++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', `${(i / cols) * 100}%`);
            line.setAttribute('y1', `0%`);
            line.setAttribute('x2', `${(i / cols) * 100}%`);
            line.setAttribute('y2', `100%`);
            line.setAttribute('class', 'grid-line');
            mapGroup.appendChild(line);
        }
        for (let i = 0; i <= rows; i++) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', `0%`);
            line.setAttribute('y1', `${(i / rows) * 100}%`);
            line.setAttribute('x2', `100%`);
            line.setAttribute('y2', `${(i / rows) * 100}%`);
            line.setAttribute('class', 'grid-line');
            mapGroup.appendChild(line);
        }

        // --- Отрисовка линий ---
        connections.forEach(conn => {
            const p1 = planetMap[conn.from];
            const p2 = planetMap[conn.to];

            if (p1 && p2) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', `${p1.x}%`);
                line.setAttribute('y1', `${p1.y}%`);
                line.setAttribute('x2', `${p2.x}%`);
                line.setAttribute('y2', `${p2.y}%`);
                line.setAttribute('class', 'connection');
                mapGroup.appendChild(line);
            }
        });

        // --- Отрисовка планет ---
        planets.forEach(planet => {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.textContent = '✦';
            text.setAttribute('x', `${planet.x}%`);
            text.setAttribute('y', `${planet.y}%`);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('class', 'planet');

            // 5. Раскраска по фракциям
            let factionColor = '#e0e0e0'; // Цвет по умолчанию (нейтралы)
            if (planet.faction === 'Галактическая Республика') {
                factionColor = '#ff4d4d'; // Красный
            } else if (planet.faction === 'Конфедерация Независимых Систем') {
                factionColor = '#4db8ff'; // Синий
            }
            
            text.setAttribute('fill', factionColor);
            text.style.color = factionColor; // Нужно для свечения (currentColor в CSS)

            // 3. Обработка наведения (Hover)
            text.addEventListener('mouseover', (e) => {
                hoverTooltip.textContent = planet.name;
                hoverTooltip.style.left = `${e.pageX + 15}px`;
                hoverTooltip.style.top = `${e.pageY - 25}px`; // Окно чуть выше мыши
                hoverTooltip.style.display = 'block';
            });

            text.addEventListener('mouseout', () => {
                hoverTooltip.style.display = 'none';
            });

            // Обработка клика (Полная инфа)
            text.addEventListener('click', (e) => {
                e.stopPropagation();
                hoverTooltip.style.display = 'none'; // Прячем ховер-окно при клике
                
                ttTitle.textContent = planet.name;
                ttTitle.style.color = factionColor; // Окрашиваем заголовок
                ttInfo.textContent = planet.info;
                ttFaction.textContent = planet.faction ? `Фракция: ${planet.faction}` : 'Нейтральная территория';
                
                tooltip.style.left = `${e.pageX + 15}px`;
                tooltip.style.top = `${e.pageY + 15}px`;
                tooltip.style.display = 'block';
            });

            mapGroup.appendChild(text);
        });

        // Закрываем основное окно при клике на пустое место
        svg.addEventListener('click', () => {
            tooltip.style.display = 'none';
        });

    } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
    }
}

initMap();
