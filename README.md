# U.S. Election History Viewer

An interactive, data-driven visualization of U.S. presidential election results at the county level from 2000 to 2024. Built with React, D3.js, and modern web technologies.

🔗 **[Live Demo](https://https://election-viewer.vercel.app/)** | 📊 **[Data Source: MIT Election Data & Science Lab](https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/VOQCHQ)**

## Features

### 🗺️ Interactive Map Visualization
- **County-Level Detail**: Visualize presidential election results for all U.S. counties across seven election cycles (2000, 2004, 2008, 2012, 2016, 2020, 2024)
- **Pan & Zoom**: Smooth drag-to-pan and scroll/pinch-to-zoom navigation with dedicated zoom controls
- **Responsive Tooltips**: Hover over any county to see detailed voting statistics, vote shares, and historical trends

### 🎨 Visualization Modes

#### Winner-Take-All Mode
- Displays the winning party for each county in solid colors
- Blue (Democrat), Red (Republican), Orange (3rd Party)
- Clean, traditional election map visualization

#### Vote Percentage Gradient Mode
- Advanced ternary gradient showing vote distribution across three parties
- Uses barycentric interpolation for smooth color transitions
- Purple center represents balanced vote distribution
- Provides nuanced view of competitive counties

### 📊 Cartogram View
- **Size by Votes**: Transform county shapes into circles sized by total vote count
- Web Worker-powered force simulation for smooth, performant layouts
- Pre-cached for instant switching between years
- Highlights population density and voting power

### ⏯️ Timeline & Animation
- **Continuous Playback**: Animate through 24 years of election history
- **Adjustable Speed**: Control playback speed from 0.5x to 4x
- **Smooth Interpolation**: Seamless transitions between election years
- **Scrubbing**: Drag the timeline slider to explore any point in time
- **Quick Navigation**: Click any election year for instant jump

### 🎨 Customization Options
- **Dark/Light Mode**: Toggle between themes with auto-detection of system preferences
- **County Borders**: Show or hide borders for cleaner visualization
- **Barycentric Triangle Legend**: Color guide showing three-way vote distribution

### 📈 Data Insights
- **Vote History Charts**: Mini sparklines showing voting trends over time for each county
- **Third-Party Breakdown**: Detailed information on third-party candidates and vote counts
- **Real Vote Counts**: Display estimated total votes alongside percentages
- **Interpolated Data**: Smooth transitions show estimated vote distributions between election years

### ⚡ Performance Optimizations
- **Web Workers**: Offload cartogram calculations to background threads
- **Multi-threaded Processing**: Automatic detection of CPU cores for parallel computation
- **Progressive Caching**: Pre-calculate layouts while you explore
- **Compressed Data**: Optimized CSV loading with ZIP compression
- **Memoized Rendering**: Smart component updates to prevent unnecessary re-renders

## Technology Stack

- **React 18** - UI framework with hooks
- **D3.js v7** - Geographic projections and force simulations
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **TopoJSON** - Efficient geographic data encoding
- **Lucide React** - Icon library
- **JSZip** - Data compression

## Data Source

Election data sourced from the **MIT Election Data and Science Lab (MEDSL)**, one of the most comprehensive and authoritative sources for U.S. election statistics.

- County-level presidential returns
- Includes major party and third-party candidates
- Covers seven presidential election cycles (2000-2024)

## Getting Started

### Prerequisites
- Node.js 18+ and npm/yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/keonjoe/election_viewer.git
cd election_viewer

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Project Structure

```
election_viewer/
├── src/
│   ├── App.jsx          # Main application component
│   ├── main.jsx         # React entry point
│   └── index.css        # Global styles
├── public/
│   └── election_data.csv.zip  # Compressed election data
├── 2000-2024/
│   ├── countypres_2000-2024.csv
│   └── County Presidential Returns 2000-2024.md
├── index.html
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## Key Components

- **TriangleLegend**: Barycentric gradient legend showing three-way vote distribution
- **Cartogram Worker**: Web Worker for background force simulation calculations
- **Interactive Map**: SVG-based map with zoom/pan and hover interactions
- **Timeline Controls**: Playback, scrubbing, and speed adjustment
- **Tooltip System**: Rich data display with charts and statistics

## Browser Support

- Modern browsers with ES6+ support
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

See [LICENSE](LICENSE) file for details.

## Acknowledgments

- MIT Election Data and Science Lab for comprehensive election data
- U.S. Atlas project for geographic topology data
- The D3.js and React communities for excellent documentation

## Civic Engagement

🇺🇸 **[Register to Vote](https://vote.gov)** - Make your voice heard in future elections!

---

Built with ❤️ for democracy and data visualization