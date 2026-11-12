# AERO-X 3D 台灣城市無人機模擬系統 — AI 協同開發交接與架構技術規格書
> **文件性質**：AI 協同開發交接手冊 (AI-to-AI Technical Handover & Architecture Specification)  
> **適用對象**：接續開發之 AI Assistant / 軟體工程師  
> **核心目標**：提供專案全貌、代碼架構、數學模型、已知陷阱（Gotchas）及擴充接口，確保新 AI 接手時零落差無縫協同。  
> **目前資源版本**　`app.js?v=3.96`、`style.css?v=3.22`

---

## 📌 目錄
1. [專案概觀與核心設計哲學](#1-專案概觀與核心設計哲學)
2. [技術棧與執行環境約束](#2-技術棧與執行環境約束)
3. [目錄結構與檔案權責](#3-目錄結構與檔案權責)
4. [核心子系統架構詳解](#4-核心子系統架構詳解)
   - [4.1 空間座標系與世界規模](#41-空間座標系與世界規模)
   - [4.2 程式化都市與台灣在地建築管線](#42-程式化都市與台灣在地建築管線)
   - [4.3 物理引擎與硬核四軸空氣動力學模型 (Advanced Flight & Ballistic Physics)](#43-物理引擎與硬核四軸空氣動力學模型-advanced-flight--ballistic-physics)
   - [4.4 氣候與大氣動力學引擎 (Weather Dynamics, Atmospheric Sky & Rain Shader)](#44-氣候與大氣動力學引擎-weather-dynamics-atmospheric-sky--rain-shader)
   - [4.5 空間碰撞體與防穿透機制 (Colliders & Safeguards)](#45-空間碰撞體與防穿透機制-colliders--safeguards)
   - [4.6 HUD 航空電子儀表與 UI 渲染架構](#46-hud-航空電子儀表與-ui-渲染架構)
   - [4.7 新手飛行培訓學校系統 (Training Academy System)](#47-新手飛行培訓學校系統-training-academy-system)
   - [4.8 野外戰場戰術打擊系統 (Tactical Strike & Wilderness Warfare)](#48-野外戰場戰術打擊系統-tactical-strike--wilderness-warfare)
   - [4.9 場景載入與資源管理](#49-場景載入與資源管理)
5. [全域狀態機 (Global State Machine)](#5-全域狀態機-global-state-machine)
6. [歷次重大迭代與除錯里程碑 (Changelog)](#6-歷次重大迭代與除錯里程碑-changelog)
7. [AI 接續開發之核心規範與高危地雷 (Crucial Gotchas & Invariants)](#7-ai-接續開發之核心規範與高危地雷-crucial-gotchas--invariants)
8. [未來擴充路線圖與代碼插槽 (Roadmap & Extension Hooks)](#8-未來擴充路線圖與代碼插槽-roadmap--extension-hooks)

---

## 1. 專案概觀與核心設計哲學

- **專案名稱**：AERO-X 3D Taiwan Urban Drone Simulator
- **專案定位**：基於 WebGL 的高擬真台灣都會街區無人機模擬飛行系統。
- **核心設計哲學**：
  1. **零外部重型資產依賴 (Zero External Asset Dependency)**：
     - 不載入外部 `.gltf` / `.obj` 網格檔或第三方圖床圖片。
     - **所有建築外牆、台灣特色招牌、路面標線、水滴紋理、天空漸層均由 HTML5 Canvas 2D 程式化生成或純代碼 Shader 渲染**。
     - 正式入口使用本機函式庫與程式化資產，可離線開啟。
  2. **高真實度台灣在地都會氛圍**：
     - 具備騎樓（退縮走廊）、頂樓加蓋鐵皮浪板、抿石子女兒牆、白鐵不銹鋼水塔、冷氣室外機組、立體懸掛霓虹雙面招牌、鐵路平交道。
  3. **兼顧娛樂性、教學性與物理可信度**：
     - 提供「自穩定高（Attitude/Altitude Hold）」與「運動競速（Sport，保留姿態回正）」雙物理模式。
     - 內建六大循序漸進任務之「新手飛行訓練學校（Training Academy）」，輔助使用者從零掌握操控技巧。
     - 整合真實氣象擾動：橫向風阻推移、動態陣風微亂流、雨水下沉氣流加速度與濕度阻尼。

---

## 2. 技術棧與執行環境約束

- **核心渲染引擎**：Three.js `r128` (本機路徑：`vendor/three.min.js`)
- **動畫輔助庫**：GSAP `3.x` (本機路徑：`vendor/gsap.min.js`)
- **音效子系統**：Web Audio API (原生合成音頻振盪器與噪訊節點，無需任何外部音效檔)
- **代碼組織風格**：
  - **原生標準 Vanilla JavaScript (ES6+)**。
  - **禁止**引入 Webpack/Vite 等重型打包工具，維持純靜態伺服器（或瀏覽器直開）隨時可運作。
  - 資源快取控制：根目錄 `index.html` 目前載入 `app.js?v=3.93` 與 `style.css?v=3.22`。

---

## 3. 目錄結構與檔案權責

```
UAV Simulator/
│
├── index.html               # DOM 結構、HUD 儀表元件、SVG 人工水平儀、選單與培訓結業證書 Modal
├── style.css                # 航電儀表深色主題、訓練導引卡、按鍵呼吸高亮動畫、考照證書版面
├── app.js                   # 核心邏輯（單一原生 JavaScript 腳本，共 11,198 行）
├── update.md                # 本技術交接與架構規格手冊
│
├── vendor/
│   ├── three.min.js         # Three.js 核心函式庫 (r128)
│   ├── gsap.min.js          # GSAP 動畫庫 (3.x)
│   └── GLTFLoader.js        # 備用 GLTF 載入器
│
└── models/
    ├── drone.glb            # 備用無人機外觀模型
    └── drone_data.js        # 內嵌備用數據
```

### 檔案清理盤點確認（2026-11-12 更新）

- 歷史空檔 `0.1` 與暫存快取目錄 `scratch/` 已徹底移除，專案根目錄保持整潔。
- `vendor/GLTFLoader.js`、`models/drone.glb`、`models/drone_data.js` 屬備用 3D 資產，目前系統維持純代碼程序化生成。
- `vendor/three.min.js`、`vendor/gsap.min.js`、`style.css?v=3.22`、`app.js?v=3.96` 為核心運行資產。

### `app.js` 核心模組精確導航地圖 (總計 11,198 行)

| 區段行數 | 核心模組 | 搜尋定位用函式與狀態 | 職責與關鍵技術 |
| :--- | :--- | :--- | :--- |
| **L1 ~ L350** | 輸入監聽與全域狀態 | `state`, `PHYSICS`, `sampleFlightControls` | 鍵盤事件映射、單雙手飛控配置、全域狀態機初始化 |
| **L351 ~ L875** | 程序化 IBL 與光照 | `getProceduralEnvMap`, `envMapCache` | PMREMGenerator 烘焙 6 面 CubeMap、PBR 金屬光澤與物理反射 |
| **L876 ~ L3399**| 台灣都會街廓生成 | `buildCityBackdrop`, `buildCity`, `buildTaiwanMarketStreet` | 騎樓商圈、連鎖招牌 Canvas 繪製、高鐵/台鐵平交道、街景家具 |
| **L3400 ~ L3699**| 瑞利/米氏天空天穹 | `buildAnimeSky`, `sampleCloudField` | 瑞利與米氏前向散射 Shader、黃昏金珀色溫、六大天候動態雲層形態學 |
| **L3700 ~ L4250**| 氣候系統與雨滴 Shader | `WEATHER_PROFILES`, `buildRainSystem`, `applyWeather` | 6大氣候模型、景深衰減雨絲 Shader、尾端 Alpha 漸層、雨滴動力受力 |
| **L4251 ~ L5600**| 四軸機體與武器外掛 | `createDroneMesh`, `createBombMesh` | 82mm 流線卵形迫彈建模、解保風輪、腹下雙聯裝平臥導軌外掛架 |
| **L5601 ~ L6750**| 野外地景與植被物理 | `buildWildernessLandscape`, `applyTreeWindShader` | 700m 高低丘陵、4層錐裙針葉松、3向交叉闊葉林、陡坡崩岩、GPU 樹木風力搖曳 |
| **L6751 ~ L7100**| RK4 外彈道數值積分 | `evaluateBombAccel`, `stepBombRK4`, `sampleCanopyBallisticDrag` | 四階龍格-庫塔高精度彈道解算、空氣密度隨高度衰減、樹冠阻滯減速 |
| **L7101 ~ L8200**| 重裝戰車動量與掩體 | `inflictTankBattleDamage`, `wildernessRadarSite` | 50噸戰車被擊中動量滑行、座圈焦黑破口、山頂雷達站、反斜面加固彈藥掩體 |
| **L8201 ~ L9450**| 飛行動力學演算 | `updateDronePhysics`, `checkTacticalObjectives` | VRS 渦環狀態下沉衰減、地面效應 (IGE)、槳葉揮舞力矩、400Hz 飛控微震顫 |
| **L9451 ~ L10400**| 航電 HUD 與戰術雷達 | `updateHUD`, `drawTacticalMap` | MIL-STD-1787C 俯仰天梯、MIL-Grid 密位下視瞄準、CCIP 方位引導線、BVR 指引 |
| **L10401 ~ L11030**| 任務流程與考照證書 | `TRAINING_TASKS`, `showScoreboardModal` | 新手學校六大科目、智能起點復位、考照評級與戰場評分矩陣 |
| **L11031 ~ L11198**| 場景生命週期與主迴圈 | `loadWorldForMode`, `buildCityWorld`, `animate` | 生成器 Generator 分段載入讓出幀時間、資源卸載釋放、主動畫循環 |

---

## 4. 核心子系統架構詳解

### 4.1 空間座標系與世界規模
- **單位長度**：1 單位 = 1 公尺 (meter)。
- **軸向定義**：
  - **$+Y$ 軸**：垂直高度（無人機起飛點地面高度基準為 $Y = 0.95$ m）。
  - **$+X$ 軸**：正東方。
  - **$+Z$ 軸**：正南方（北方為 $-Z$ 軸）。
- **城市範圍**為 430 × 430 公尺。X 為 −215 至 215 公尺，Z 為 −325 至 105 公尺。兩種航圖與飛行邊界共用 `CITY_BOUNDS`，起降廣場位於原點。
- **模擬高度上限**：世界座標 Y 為 120 公尺。野外 HUD 的離地高度另以當地地形計算。

---

### 4.2 程式化都市與台灣在地建築管線
- **建築生成器邏輯**：
  - 非固定單一網格，而是使用分區演算法（A區站前騎樓、B區車站鐵道、C區公園綠地、D區公寓住宅、E區高層商辦）。
- **招牌繪製引擎 (`drawTaiwanBrandSign`, `drawVerticalSign`)**：
  - 透過 Canvas 2D 程式化繪製台灣代表品牌：
    - 超商：7-ELEVEN、全家 FamilyMart、全聯福利中心、家樂福便利購
    - 藥妝：屈臣氏、康是美、寶雅
    - 手搖：50嵐、清心福全、迷客夏、麻古茶坊、可不可熟成紅茶
    - 小吃：老牌排骨飯、永和豆漿大王、台南牛肉湯、彰化肉圓、鼎泰豐、八方雲集
  - 所有發光材質登錄於 `window.taiwanEmissiveMaterials`，隨日夜（`applyTimeOfDay`）自動調節自發光強度（夜晚自發光 $1.85$，白天 $0.22$）。
- **寫實屋頂系統**：
  - 台灣標準建築女兒牆（高度 $1.2\text{m}$，厚度 $0.25\text{m}$ 圍繞四周）。
  - 防水塗料地坪（灰水泥、抿石子、防水綠漆 PU）。
  - 白鐵不銹鋼水塔（圓柱儲水槽 + 金屬角鐵三角支架）。
  - 冷氣室外機組群（附百葉散熱紋理與管線）。

---

### 4.3 物理引擎與硬核四軸空氣動力學模型 (Advanced Flight & Ballistic Physics)

位在 `app.js` 的 `updateDronePhysics(dt)`（L8808）與外彈道解算核心（L6751~L7100）：

#### 1. 六自由度 (6-DOF) 飛控與姿態解算
- **輸入採樣 (`sampleFlightControls`)**：採集 `throttle` (升降), `yaw` (偏航), `pitch` (俯仰), `roll` (橫滾), `boost` (加速), `brake` (空煞)。
- **自穩與特技雙模式**：
  - `stabilized` 自穩定高模式：具備主動傾角限幅（$28^\circ$）與動態回正阻尼，維持平穩巡航。
  - `sport` 運動競技模式：解鎖高速俯仰角（最高 $52^\circ$）與特技翻滾能力，升降速率上限解鎖至 $24.0	ext{ m/s}$。

#### 2. 軍規多軸空氣動力學特性 (Advanced Aerodynamics)
- **渦環狀態 (VRS, Vortex Ring State) 與主動飛控限幅**：
  - 當無人機在原地近乎無水平速度垂直急降（下降率超過 $7.5	ext{ m/s}$ 且水平空速 $<2.0	ext{ m/s}$）持續 1.5 秒以上時，旋翼陷入自身下洗氣流渦環，觸發 VRS 狀態。
  - 飛控表現：升力衰減高達 38%、油門響應遲鈍、伴隨 400Hz 高頻微幅姿態震顫；一旦推桿產生水平空速（$>2.0	ext{ m/s}$），渦環迅速被吹散改出。
  - 自穩飛控具備主動渦環保護：無水平速度時垂直下降限幅於安全值 `hoverDescentLimit = 7.5 m/s`。
- **地面效應 (IGE, In-Ground Effect)**：
  - 當無人機接近地表（離地高 $	ext{AGL} \le 1.8	ext{m}$）時，地面阻擋下洗氣流擴散形成高壓氣墊，升力效率自動增加 $12\% \sim 24\%$，提供真實的著陸浮力緩衝。
- **動態迎風阻力與旋翼揮舞傾斜力矩 (Blade-Flapping & Weathercocking)**：
  - 陣風脈衝（Gust Pulse）與風切變時，前行槳與後行槳升力差產生向順風側傾斜之揮舞力矩；機尾與外掛彈翼產生側風風標偏航拉扯力矩。
- **HUD 氣動狀態即時遙測 (`#hud-throttle-state`)**：
  - 即時反映當前氣動狀態：`渦環亂流 VRS`（紅字警告）、`地面效應 IGE +X%`（翠綠提示）、`外掛 +3.2kg`、`自動定高 / 運動手動`。

#### 3. 四階龍格-庫塔 (RK4) 外彈道解算引擎與樹冠氣動阻滯
- **RK4 高精度外彈道數值積分 (`stepBombRK4`, `evaluateBombAccel`)**：
  - CCIP 預測瞄準與實體迫彈飛行共用同一套高精度 RK4 數值積分核心與次步長地面相交內插演算法。
  - 物理耦合：大氣密度隨海拔指數衰減 $
ho(y) = 
ho_0 e^{-y/8500}$、高度風切梯度、尾翼未對齊前之非線性阻力曲線、Magnus 側向氣動耦合。
- **穿透樹冠氣動阻滯 (`sampleCanopyBallisticDrag`)**：
  - 迫彈穿過高山針葉松或低地闊葉林樹冠碰撞體時，動態提高 $2.4	imes \sim 3.8	imes$ 空氣阻力並疊加微亂流偏折，真實模擬枝葉減速與彈道散布。

---

### 4.4 氣候與大氣動力學引擎 (Weather Dynamics, Atmospheric Sky & Rain Shader)

氣候系統定義於 `WEATHER_PROFILES`，支援 6 大天候風格：

| 鍵值 (ID) | 顯示名稱 | 基準風速 | 陣風上限 | 下沉氣流加速度 | 濕度阻力倍率 | 功耗負載 | 粒子數 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `clear` | ☀️ 晴朗微風 | 0.8 m/s | 1.2 m/s | $0.00	ext{ m/s}^2$ | 1.00x | 1.00x | 0 |
| `cloudy` | ☁️ 涼爽陰天 | 2.4 m/s | 3.6 m/s | $0.00	ext{ m/s}^2$ | 1.05x | 1.06x | 0 |
| `drizzle` | 🌦️ 街頭細雨 | 3.2 m/s | 4.8 m/s | $-0.35	ext{ m/s}^2$ | 1.15x | 1.18x | 1,600 |
| `heavy_rain` | 🌧️ 盆地豪雨 | 6.2 m/s | 8.5 m/s | $-0.85	ext{ m/s}^2$ | 1.28x | 1.38x | 3,600 |
| `fog` | 🌫️ 晨曦濃霧 | 1.2 m/s | 1.8 m/s | $-0.08	ext{ m/s}^2$ | 1.22x | 1.12x | 0 |
| `typhoon` | 🌀 颱風驟雨 | 10.5 m/s | 14.0 m/s | $-1.45	ext{ m/s}^2$ | 1.45x | 1.65x | 5,200 |

#### 飛行動態影響公式：
- **陣風震盪 (Gust Factor)**：
  $$	ext{gustOsc} = \sin(1.5 t) 	imes 0.35 + \cos(3.7 t) 	imes 0.25$$
- **高頻微亂流 (Turbulence Jitter)**：
  $$\Delta v_x = (\sin(7.1 t) + \cos(11.3 t)) 	imes turb 	imes 0.28 \cdot dt$$
  $$\Delta Roll = \sin(9.2 t) 	imes turb 	imes 0.02 \cdot dt$$
- **雨水重力下壓 (Rain Downdraft)**：
  $$v_y = v_y - downforce 	imes dt$$

#### 大氣瑞利/米氏散射天穹與六大天候動態雲層形態學 (`buildAnimeSky`, `sampleCloudField`)：
- **大氣散射物理天穹**：結合瑞利（Rayleigh）藍天分子散射與米氏（Mie）前向陽光散射自訂頂點/片元 Shader，營造透亮深邃的立體大氣穹頂。
- **黃昏自然金珀色溫校正**：移除舊版刺眼的洋紅色與紫地光，改為暮色黛藍天頂（`0x243b55`）、暖金珀中天（`0xc28d64`）與香檳金地平線（`0xf2c57c`）。
- **六大天候專屬雲種形態學 (`weatherAtmosphere`)**：
  - `clear`（晴朗）：湛藍晴空 + 輕羽狀卷雲（Cirrus）+ 晴空淡積雲（Cumulus Humilis）。
  - `cloudy`（多雲）：柔和灰藍 + 自陰影濃厚之層積雲與濃積雲群（Stratocumulus）。
  - `drizzle`（微雨）：陰雨灰藍 + 水平延展成片之高層雲與雨層雲（Altostratus / Stratus）。
  - `heavy_rain`（豪雨）：深沉鉛灰 + 翻湧烏黑雲底之積雨雲（Cumulonimbus）。
  - `fog`（濃霧）：乳白灰霧天穹 + 均勻低垂霧層雲（Stratus Nebulosus）。
  - `typhoon`（颱風）：昏暗炭灰 + 劇烈渦旋拉扯之颱風眼牆暴風黑雲帶（Typhoon Supercell Bands），且隨即時風速動態飄移。

#### 大氣景深衰減斜雨 Shader 與陣風雨幕系統 (`buildRainSystem`)：
- **徹底排除垂直靜止白線 Bug**：嚴格同步 `setDrawRange` 與 `updateRain` 之有效雨滴數量上限，消除末端多餘粒子滯留。
- **自訂距離衰減與尾端透明漸層 Shader**：
  - 尾端 Alpha 歸零漸層：水滴前端半透明，上端尾跡平滑淡出至完全透明，消除生硬截斷。
  - 景深衰減（$4.2	ext{m} \sim 32	ext{m}$）：雨絲僅在鏡頭近距範圍內呈現細緻微透雨絲，超過 $32	ext{m}$ 自然融入背景霧氣，不再在遠山拉出突兀白線。

#### GPU 頂點著色器全場景樹木風力動態搖曳物理 (`applyTreeWindShader`, `updateTreeWind`)：
- 樹根處位移歸零牢固抓地，隨高度以非線性次幂曲線（$h^{1.6 \sim 1.75}$）向下風向傾側並自動保持長度守恆。
- 結合宏觀擺動頻率（$pprox 1.15	ext{Hz}$）與微觀葉片顫動（$pprox 4.6	ext{Hz}$），即時連動 `customDepthMaterial` 讓地面陰影與樹木同步搖擺，並完美響應六大天候風速！

---

### 4.5 空間碰撞體與防穿透機制 (Colliders & Safeguards)
- **碰撞陣列**：
  - `buildingColliders`：靜態建築與騎樓柱 AABB 碰撞盒。
  - `movingColliders`：行進中列車與車輛動態 AABB 碰撞盒。
- **防止高速穿透 (Tunneling Prevention)**：
  - 採用步進細分（Sub-stepping）：
    $$steps = \max\left(1, \left\lceil \frac{\|\mathbf{v}\| \cdot dt}{r_{drone} \times 0.35} \right\rceil\right)$$
- **關鍵安全防護**：
  - 在 `registerBoxCollider()` 設置嚴格防護，任何座標含有 `NaN`、`undefined` 或非有限數字時拒絕寫入並發出警告，徹底防止物理世界座標崩潰。

---

### 4.6 HUD 航空電子儀表與軍用地面站 (GCS) 介面架構

本系統之抬頭顯示器（HUD）與下視光學瞄準具，依據美軍航空電子標準 **MIL-STD-1787C** 與軍用無人機地面控制站（GCS，參考 STANAG 4586）之人機介面規範設計，兼具飛行操控直覺性與高度軍事擬真度：

#### 1. 前向巡航與俯仰天梯 (`#horizon-svg`)
- **中心準星**：動態 SVG 俯仰天梯（Pitch Ladder）與人工水平儀（Artificial Horizon）。
- **即時數據儀表**：
  - 水平地速 GS (`hud-speed`, km/h) 與動態刻度條。
  - 離地高度 AGL (`hud-altitude`, m) 與動態刻度條。
  - 垂直升降速度 VSI (`hud-vspeed`, m/s) 與自動定高狀態指示。
  - 姿態姿態角 ATT（即時 Pitch / Roll 度數數值）。
- **雙雷達航圖**：
  - 右下角即時戰術俯瞰雷達 (`#minimap-canvas`)。
  - 按 `M` 鍵呼叫之全螢幕向量地圖 (`#fullmap-canvas`)。
- **飛行 HUD 與 Esc 暫停面板（v2.91）**：
  - 飛行時顯示儀表、航向與小地圖。原右上快捷設定及下方操控圖解移入 `#pause-modal`。
  - 飛行中按 `Esc` 開啟暫停面板。暫停時停止飛行、計時及戰場模擬更新。

#### 2. 軍規下視光學瞄準分劃板 (`#nadir-optics-svg`)
切換至機腹光電下視鏡頭時（按 `C` 鍵），前向天梯自動收起，轉入高精度軍規下視分劃瞄準系統：
- **四角戰術遙測讀數（Zero-Occlusion Outline OSD）**：
  - 左上：光學模式標籤（`EO-NADIR 90°` / `MODE: VIS-RGB [X]`）。
  - 右上：光學變焦倍率（`MAG: 1.0X [Z]`）與環境動態側風（`W: 0.8m/s`）。
  - 左下：動態真即時 GPS 座標（換算自無人機局部世界座標）與精確離地高度（`AGL: 37.0m`）。
  - 右下：安全引信狀態（`ARM: READY (≥6m)` / `DUD RISK (<6m)`）與圖傳訊號頻段（`VTX: -42dBm | 22.8V`）。
- **MIL-Grid 密位瞄準十字分劃**：具備高精度水平/垂直刻度線與中心十字瞄準圈。
- **航電卡片自適應聚焦淡化（Adaptive Dimming）**：切換為下視鏡頭時，左下角飛控數據卡自動平滑淡化至 `opacity: 0.32`，消除 AGL 重複干擾，將注意力聚焦於中央分劃具。

#### 3. 軍規 CCIP 彈著方位引導線（ASL / Bomb Fall Line）
- **航空工程背景**：正式名稱為 **BFL（Bomb Fall Line，炸彈下落線）** 或 **ASL（Azimuth Steering Line，方位引導線）**，廣泛應用於 F-16、A-10C 及 MQ-9 死神等察打一體無人機。
- **物理數學模型**：投彈時無人機往往帶有向前航速、轉彎偏航或大氣風偏推移。任務電腦由中心十字原點（0, 0）動態計算並繪製一條細虛線直連預測彈著點：
  $$\mathbf{r}_{	ext{rel}} = \mathbf{P}_{	ext{impact}} - \mathbf{P}_{	ext{drone}}$$
  $$	ext{scale} = rac{180}{	ext{AGL} \cdot 	an(	heta_{	ext{FOV}} / 2)}$$
  $$	ext{SVG}_X = (\mathbf{r}_{	ext{rel}} \cdot \mathbf{u}_{	ext{right}}) \cdot 	ext{scale},\quad 	ext{SVG}_Y = -(\mathbf{r}_{	ext{rel}} \cdot \mathbf{u}_{	ext{forward}}) \cdot 	ext{scale}$$
  飛手可直觀觀察引導線偏角，並將機身航向對齊該引導線，使炸彈準確沿航線中心線投下。
- **狀態光環反饋**：正常預測（珊瑚紅）、目標鎖定（翠綠）、引信未解保啞彈風險（金琥珀）。

#### 4. 視距外目標戰術指引指標（BVR Target Cueing / TLL）
- **航空工程背景**：正式名稱為 **TLL（Target Locator Line，目標定位線）**。在高倍率光學變焦鏡頭下，視角（FOV）極度狹窄，極易發生「吸管效應（Straw Effect）」失去周遭態勢感知。
- **運作機制**：針對未在可見分劃視野內的活躍敵軍目標（重裝坦克 T1/T2、防空雷達 RADAR、高爆彈藥庫 DEPOT），於分劃具周圍動態生成向量導引箭頭與帶有深碳防干擾膠囊之距外測距標籤（如 `T1 61m`、`RADAR 143m`），引導飛手快速變換航向獵殺，進入視野後自動隱藏，維持純淨視野。

#### 5. 零表情符號專業規範（Zero-Emoji Aviation Compliance）
- 全系統抬頭顯示器、圖傳遙測、彈道指示與警報橫幅一律嚴禁出現表情符號（Emoji），採用純粹高科技航空電訊標準與專業英文/繁體中文軍規代碼（如 `VTX: -42dBm`、`ORD: 2 / 2`）。

---

### 4.7 新手飛行培訓學校系統 (Training Academy System)

為降低四軸無人機操控門檻，將原城市計時賽全面改制為循序漸進的訓練教學系統：

#### 1. 六大訓練科目定義 (`TRAINING_TASKS`)
| 任務 | 科目名稱 | 操控重點 | 引導目標與通關條件 |
| :---: | :--- | :--- | :--- |
| **01** | **油門起飛與定高懸停** | 垂直升降 | 起飛坪上空 $10\text{m}$ 專屬 3D 全息綠色導引光環；按住 `W` 升空，懸停累計 2.0 秒通關。 |
| **02** | **俯仰前進推進** | 前後俯仰 | 按住方向鍵 `↑`（或單手 `W`）壓低機頭向前推進，穿過 1 號商圈光圈。 |
| **03** | **航向偏航轉向** | 偏航轉動機頭 | 按左手 `A`/`D`（或 `Q`/`E`）旋轉機頭校正航向，穿過 2 號平交道光圈。 |
| **04** | **橫滾左右平移側飛** | 橫向側移 | 按方向鍵 `←`/`→`（或單手 `A`/`D`）側移平飛，不轉向穿過 3 號轉角光圈。 |
| **05** | **增壓加速與空中急煞** | 衝刺與煞車 | 在市民大道直道段按住 `Shift` 衝刺，接近光圈時按 `Space` 空白鍵急煞懸停過關。 |
| **06** | **綜合返航與精準降落** | 綜合微操降落 | 沿雷達導引飛回中央 `[H]` 起降坪，低於 2 米後按 `S` 緩降接地，靜止 1.1 秒完成考照。 |

#### 2. 輔助導引元件
- **3D 定高全息光環 (`buildTrainingHoverRing`)**：在起飛坪上空 $Y=10\text{m}$ 處懸浮帶有自發光標籤之水平圓環，進入懸停高度時光環高亮轉綠。
- **HUD 互動教學指示卡 (`#training-guide-card`)**：置中懸浮於頂部，依據單/雙手鍵位動態更新按鍵說明（`<kbd>` 標籤），並展示懸停百分比或目標剩餘距離。
- **虛擬按鍵指引高亮（`.hint-active`）**：訓練任務會標記當前需要的按鍵。按 `Esc` 可在暫停面板查看對應鍵位，飛行中則由教學指示卡提供提示。
- **智能步驟安全復位（Smart Respawn）**：在訓練模式中按 `R` 鍵會重置回「當前訓練步驟之起點」，大幅減少撞牆後的重複飛行挫折。
- **結業考照合格證書**：結算畫面呈現 `AAA/AA/A` 飛行員評級、六大科目合格清單、總飛行時間與碰撞失誤次數。

---

### 4.8 野外戰場戰術打擊系統 (Tactical Strike & Wilderness Warfare)

野外戰場（`tactical_strike`）包含兩輛 T-90MS 風格巡邏戰車、一座雷達站和一座彈藥庫。任務「山谷前線行動」從山脊背坡的臨時放飛點起飛。

#### 1. 地形、陣地與模型

- **立體 3D 樹木、自然崩岩與地景植被重構**：
  - **高山針葉松（Conifers）**：採 4 層漸進收攏的 8 邊形錐形立體樹裙（Tiered Conical Foliage Skirts）結合雙向十字陰影核心，正上方俯瞰或任意航向皆呈現飽滿立體寶塔形。
  - **低地闊葉林（Broadleaf）**：採 3 向立體交叉直立葉板（0°/60°/120°）搭配雙層水平向陽冠頂蓋（Foliage Dome Discs）與手繪生成式葉片畫布，俯瞰不再薄如紙片。
  - **清除怪異巨石與真實崩岩**：徹底清除舊版 1,800 顆發光綠色球體（`scrub`），改為依據地形坡度（$	ext{steepness} > 0.30$）與高程自然生成的約 50 處風化刻面花崗崩岩與立體矮灌木。
- **程序化 PBR IBL 環境光照與 4K 像素對齊陰影**：
  - 新增 `getProceduralEnvMap`，以 `THREE.PMREMGenerator` 烘焙環境貼圖，賦予坦克裝甲、紫銅導帶與城市烤漆真實物理反射。
  - 主光源配置 4096 高解析度像素對齊跟隨陰影，徹底消除陰影閃爍鋸齒。
- **貼地馬赫震波環與動態火球點光源**：爆炸瞬間觸發高照度動態點光源（PointLight）與貼地擴散的馬赫震波環（Mach-Stem Shockwave Ring）。
- 道路依 `wildernessRoads` 生成平滑曲線並與航圖共用路徑。路面以 `wildernessRoadBaseHeight` 取樣地形，兩側及末端漸淡，雷達站與彈藥庫的聯絡路在混凝土平台外終止。
- 雷達站有設備機櫃和可旋轉的碟形天線。彈藥庫使用半開放防護棚，大小航圖以 `DEPOT` 標記。戰車具封閉下車體、三色迷彩、中空履帶及依行駛距離轉動的負重輪。砲塔轉完會停留約 9～23 秒，下一次轉向的方向與幅度有變化。
- 擊毀時生成貼地焦痕、彎折屋面與不規則破片。較重的砲塔、天線及屋面留在目標附近。重飛時會清除殘骸並還原目標。

#### 2. 放飛點、投放與任務流程

- 原點為臨時放飛點，地表採壓實泥地，四角矮標記之間有淡色十字。大小航圖顯示返航圈。水平距離中心 7 公尺內可進入降落或補給判定。
- 每次最多掛載 2 枚，任務最多投放 6 枚。彈藥配額未用完且目標仍存活時，返航可補給，裝填時間為 1.5 秒。按 `B` 投放，落點預測與實際投放都取用下一枚彈藥的掛架位置。引信同時要求至少 0.55 秒飛行時間及 6 公尺下落距離。
- 擊毀全部目標或用完 6 枚後，等待在途彈藥和連鎖爆炸處理完畢，再返航穩定降落 1.1 秒結算。降落判定還要求 HUD 離地高度不超過 1.2 公尺、總速不超過 3.2 m/s。Esc 暫停選單可中止任務並依當下紀錄直接結算。在途彈藥計入已投放數。
- `showScoreboardModal` 顯示總分、分項與各目標狀態。時間顯示到整秒，計分使用原始耗時。

| 計分項目 | 上限 | 規則 |
| --- | ---: | --- |
| 目標戰果 | 60 | 每擊毀一個目標得 15 分 |
| 投放精準度 | 15 | 依逐發直擊率計分，每枚最多記一次直擊 |
| 任務耗時 | 10 | 3 分鐘內滿分，至 6 分鐘線性遞減為 0 |
| 返航降落 | 15 | 成功降落得 15 分，中止得 0 分 |
| 碰撞扣分 | — | 每次記錄到的碰撞扣 5 分 |

總分四捨五入至整數，最低 0 分。S 級至少 90 分，A 級至少 75 分，B 級至少 55 分，其餘為 C 級。

#### 3. 光電感測器擬真機制 (NVG Phosphor Scintillation & True FLIR White-Hot)

- 按 `X` 鍵可在「彩色 (VIS-RGB)」、「白熱熱成像 (FLIR-WH)」與「微光夜視 (NVG-GRN)」之間循環切換：
  - **微光夜視 (NVG-GRN / 真實度重構)**：
    - 消除原版本「暴力放大照亮成綠色白天」之失真問題。在夜間模式下採用符合二代半/三代微光夜視管的光電增益（`dirLight` 適度增強至 1.35x、`hemiLight` 增強至 1.5x、曝光維持 1.02），使地形起伏與道路輪廓得以辨識，但暗部細節仍受環境微光限制。
    - **光學分辨率限制**：CSS 加入軍規微通道板（MCP）光學微模糊 `blur(0.55px)`，模擬光電倍增管的分辨率上限，消除數位 3D 模型的銳利邊緣，使迷彩坦克在雜訊背景中自然融入。
    - **動態光子散粒噪訊 (Dynamic Phosphor Scintillation)**：以 4 組 128×128 高頻綠白散粒雪花噪訊在每幀隨機沸騰跳動（Alpha 0.24），呈現真實夜視儀強行放大增益時粗糙的雪花顆粒質感。
    - **鏡筒光學暗角 (Eyepiece Tube Vignette)**：於 VTX 畫布繪製美軍標準夜視鏡筒之圓形光學過渡暗角。
  - **白熱熱成像 (FLIR-WH / 高對比長波紅外)**：
    - 採用高對比冷峻濾鏡（`contrast(180%) brightness(88%)`），將無熱源的冷山體、樹林與泥土壓低為深黑灰底色。
    - **目標專屬熱輻射簽徵 (Thermal Signatures)**：
      - 巡邏重型坦克：發熱之後甲板（`warm` 高亮層）、排氣管噴口（`hot` 純白發光）與持續向後飄散的排氣熱羽流（Puffs）。
      - 前線防空雷達站：通訊設備機櫃正面散熱面、發電機後方高溫排氣口，以及向上升騰擴散的發電機排熱煙氣羽流。
      - 目標擊毀後，高溫熱特徵隨半衰期逐漸冷卻衰減。
    - 戰術定位：夜間飛行時，NVG 提供微光地形輪廓以利防撞；FLIR 則以刺眼的白熱亮光穿透黑暗，精準鎖定坦克與雷達站熱源！
- `buildCCIPMarker` 的場景圓環、十字線與中心點共用高繪製順序，停用深度測試與深度寫入，三種感測模式中都會疊在戰車、雷達站與地形之上。下視 SVG 準星與引導線另由 HUD 繪製。

#### 4. 50 噸重裝戰車動量物理與滑行減速 (Tank Coasting Inertia Dynamics)

- **物理背景**：過去坦克在被致命命中瞬間立即原地凍結定格，嚴重背離牛頓第一運動定律。T-90MS 級重裝主力戰車全備重達 48~50 噸，在巡邏行進中具備巨大的前向動量（$\mathbf{p} = m\mathbf{v}$）。
- **實裝動力學模型**：
  - **砲塔飛脫與底盤滑行分離**：被命中瞬間砲塔被炸飛脫離，戰車底盤（`t.coasting = true`）繼承原本巡邏前進速度（約 1.6~2.0 m/s）向前持續滑行。
  - **阻尼減速曲線**：採用真實履帶與地面摩擦阻尼率（約 $0.82\text{ m/s}^2$）漸進減速，持續滑行約 1.5～2.0 秒（前進 2～4 公尺距離）。
  - **動態負重輪隨動與地形貼合**：滑行期間負重輪與履帶持續隨滑行里程滾動，並以 `alignTankToRoad` 即時動態貼合道路縱坡與起伏。
  - **連鎖損壞冒煙爆鳴**：滑行期間每隔 0.22 秒自損毀內部噴發爆鳴火光與黑煙（`createDudBlastEffect`），動能完全歸零（速度 $\le 0.04\text{ m/s}$）後車身停止，並在該處生成貼地燃燒焦痕。

#### 5. 軍規戰術聲學架構與觀察者視角自適應 (Tactical Avionics Audio & Observer Acoustics)

- **廢除二戰好萊塢吹哨笛音**：徹底移除 `playBombWhistle`（$1150\text{Hz} \to 260\text{Hz}$ 尖銳哨音）。現代無人機改裝迫擊砲彈或手榴彈均無發聲哨，彈藥下墜全程寂靜無聲，符合現代戰術打擊突襲真實感。
- **機載舵機脫鉤與 HUD 確認音 (`playBombRelease`)**：
  - 微型舵機插銷脫鉤之機械「喀嗒」（Mechanical Servo Click，三角形波 $680\text{Hz} \to 140\text{Hz}$ 於 35ms 內快速衰減）與彈體離架微弱低頻彈跳音。
  - 飛手耳機 / GCS 地面站之雙頻戰術電子確認嗶聲（正弦波 $1920\text{Hz} \to 2450\text{Hz}$ 短促 Chirp），即時提示飛手 "ORD RELEASED"。
- **視角自適應爆炸音效 (`playExplosion`)**：
  - **下視光電打擊鏡頭 (`cameraMode === 'down'`)**：模擬高空光電吊艙與地面控制站視角。高空距離與大氣強烈吸收高頻破片雜音，系統啟動深度低通濾波（Cutoff $< 115\text{Hz} \to 26\text{Hz}$），呈現沉悶、厚重、帶有空氣震盪感的遠距低頻氣壓衝擊波（Sub-Bass Shockwave Rumble）。
  - **機後第三人稱視角 (`cameraMode === 'chase'`)**：模擬外部戰場環境，保留全頻段爆風氣浪、破片與重低音衝擊。

#### 6. 數位圖傳去掃描線規範與感測器光學特性 (Digital VTX Scanlines Removal & Optical Fidelity)

- **移除類比滾動掃描線**：徹底清除舊版 CSS `#fpv-overlay` 的 `repeating-linear-gradient` 與 `updateVTXOverlay` 畫布上下滾動掃描線，符合現代軍用/高階商用無人機數位圖傳高解析特性。
- **各視角光學真實度**：
  - **第三人稱視角 (Chase)**：完全純淨直視（`opacity: 0`），無任何噪點濾鏡。
  - **可見光模式 (VIS-RGB)**：呈現無噪點純淨數位高清畫面。
  - **微光夜視 (NVG)**：保留微通道板（MCP）微模糊、動態磷光閃爍雪花點（Scintillation Grain）與圓形鏡筒光學暗角。
  - **白熱熱成像 (FLIR)**：保留非均勻性細微噪點（FPN）與引擎/排氣羽流強烈熱反差。

#### 7. 82mm 現代改裝迫擊砲彈與腹下雙聯裝外掛系統 (82mm Mortar & Belly Pylon Assembly)

- **現代改裝迫擊砲彈幾何建模 (`createBombMesh`)**：
  - 根據烏克蘭現代戰場廣泛應用的大型無人機精確投彈構型，建立 82mm 迫彈專屬 3D 模型：
    - **本體鑄鐵彈體**：以 `THREE.LatheGeometry` 旋轉成型建立具備卵形流線弧度（Ogive Profile）的厚壁鑄鐵彈身，直徑 82mm，深橄欖綠（`0x3d4734`）消光軍規塗裝。
    - **前引信與金屬撞針**：彈尖設有高硬度金屬碰炸撞針與引信座（Striker & Fuze Collar，直徑 6mm 細尖）。
    - **3D 列印解保風車**：彈尖後方配置醒目的亮橘色（`0xf97316`）高強度 PLA 3D 列印解保安全風車（Arming Vane），彈藥下墜時氣流驅動自旋解鎖碰炸保險。
    - **TNT 黃色高爆識別帶**：彈體前肩部帶有鮮明的高爆彈藥黃色識別色環（`0xeab308`）。
    - **紫銅定心導帶**：彈腰部設有紫銅導帶（Copper Driving Band，`0xcd7f32`）。
    - **6 片安定尾翼**：尾桿末端配置 6 片徑向高強度鋼質黑色安定翼（`0x27272a`）。
    - **3D 列印環形穩定導流罩**：尾翼外緣包覆直徑 128mm 之高可視度軍用橘色（`0xeb5e28`）圓柱導流環（Airdrop Shroud Ring），增強下落時的氣動阻尼與方向穩定性。
- **機腹雙聯裝輕量化派龍外掛架 (`buildDroneBellyPayload`)**：
  - 機腹左右對稱（X = ±0.29m）配置兩組碳纖複合材料掛架，帶有伺服快拆脫鉤銷（Quick-Release Clamp Pin）。
  - 彈體以 5.5°（-0.095 rad）前傾微俯角橫向懸掛於機腹下方，符合無人機巡航與平飛時的氣動迎風角。
  - 最大攜彈量 2 枚，任務總投放額度 6 枚，支援在野戰臨時起降坪（FARP）1.5 秒快速裝填。

#### 8. 空氣動力學姿態解耦與平滑俯衝模型 (Decoupled Aerodynamic Alignment Dynamics)

- **坐標系無關之瞬時向量對齊**：
  - 徹底揚棄依賴世界北方固定向量之傳統做法，消除飛手在不同航向角（Yaw 0°~360°）投彈時的姿態畸變與 180° 反轉倒栽蔥缺陷。
  - 取得彈體在空間中的真實彈頭向量 `currentNose = (0, 0, -1).applyQuaternion(b.quaternion)`，計算其與動態相對空速向量 `targetDir` 之最短旋轉軸：
    $$\mathbf{a}_{\text{rot}} = \mathbf{n}_{\text{current}} \times \mathbf{v}_{\text{target}}$$
  - 透過 `b.quaternion.premultiply(deltaQuat)` 在動壓增長過程中平滑低頭，彈尖撞針永遠精準朝向下落軌跡前沿，尾翼導流環穩定在迎風上方。
  - **阻尼衰減擺動與自旋**：實裝初始氣動過衝擺動（$e^{-3.2t} \sin(14t)$）與沿縱軸之微自旋，帶來無可挑剔的軍事模擬質感。

#### 9. 履帶破片受損煙霧與 WebGL 深度緩衝區穿透修復 (Track Damage FX & Depth Safeguard)

- **履帶癱瘓黑煙粒子 (`createTrackDamageSmoke`)**：
  - 巡邏坦克遭近距破片致盲癱瘓後，自受損履帶斷續噴發隨風向上擴散之滾滾黑煙。
  - **深度緩衝修復**：強制指定 `depthWrite: false`，徹底消除半透明粒子將後方地表/陰影裁切為矩形破圖的 WebGL 深度測試缺陷。

### 4.9 場景載入與資源管理

- 主選單啟動時保留共用的飛行與渲染資源。第一次選擇城市或戰場玩法才建立對應地景。跨場景切換時由 `loadWorldForMode` 卸載舊場景、清理碰撞與航圖引用，並分段建立新場景。同場景重飛會重用既有地景。
- `buildCityWorld` 與 `buildWildernessBattlefield` 依生成階段讓出瀏覽器畫面更新機會，載入面板顯示目前階段，載入期間暫停飛行模擬。
- 城市相同的磁磚、招牌與材質共用資源。招牌貼圖依品牌與方向區分，材質另依發光色區分。野外的樹幹、葉叢、草、碎石和部分履帶細節採實例化。
- 野外靜態碰撞依 12 公尺網格索引，搜尋範圍包含無人機半徑。若碰撞把無人機推到相鄰區塊，依原始碰撞順序繼續檢查。動態戰車、可見的目標部件和城市的升降柵欄各自更新碰撞範圍。

---

## 5. 全域狀態機 (Global State Machine)

- `state` 是 `app.js` 的頂層 `const`。模式與飛行狀態由這裡管理，包括 `gameMode`、`weather`、`cameraMode`、`flightMode`、`keymapMode`、訓練步驟、比賽計時與雙人軌跡。
- `menuOpen` 對應主選單，`pauseOpen` 對應飛行暫停面板，`mapOpen` 和 `scoreboardOpen` 分別對應全圖與結算。`animate` 依這些旗標與頁面可見狀態決定是否推進模擬。
- `tacticalState` 保存野外任務的彈藥、目標、爆炸與殘骸，例如 `bombsRemaining`、`targets`、`activeBombs`、`explosions`、`debris` 與 `rearmTimer`。

---

## 6. 歷次重大迭代與除錯里程碑 (Changelog)

### v2.00 ~ v2.40：在地化基礎建設
- 導入騎樓步道與台灣特色招牌（超商、小吃、手搖飲）。
- 導入平交道、台鐵塗裝列車與綠地公園。

### v2.50：空間座標除錯與 NaN 崩潰排除
- **問題**：轉角斜向店面 `shop.side` 未定義，造成三角函數計算返回 `NaN`，無人機瞬間被傳送至無窮遠藍天（HUD 顯示 `NaNm`）。
- **解法**：建立嚴格局部到世界座標旋轉矩陣運算，並在 `registerBoxCollider` 加入 `isNaN` 安全守衛。

### v2.60：屋頂擬真重構與全城街廓擴展
- 解決屋頂顏色不自然問題，改為台灣女兒牆抿石子、防水綠漆地坪、鐵皮加蓋與不銹鋼白鐵水塔。
- 採用分區程式化演算法，將精緻台灣街景從單一站前小區擴展至全城五大主題街區。

### v2.70：選單視覺現代化與動態氣候物理系統
- **選單輕量化**：移除冗贅英文小標與長文字，主標題純化為《AERO-X 3D 台灣城市無人機模擬系統》。
- **Hover 彈窗說明**：模式說明改為滑鼠懸停（`:hover`）時平滑浮現，維持選單簡潔俐落。
- **天色選項簡約化**：精簡為「☀️ 白天」、「🌇 黃昏」、「🌌 夜晚」。
- **視角命名標準化**：全面更新為「機後視角」與「前方視角」。
- **6 大氣候動態系統**：晴天、陰天、細雨、豪雨、濃霧、颱風。
- **飛行動力學疊加**：陣風亂流抖動、雨水重力下壓、濕度風阻與即時動態儀表摘要。

### v2.80：新手飛行操控訓練學校模式 (Training Academy Mode)
- **模式重構升級**：將原城市計時賽全面改制為「🎓 新手飛行訓練學校（Training Academy）」，幫助新手一步步掌握四軸無人機各項基礎操作。
- **六大循序漸進訓練科目 (TASK 1 ~ 6)**：
  1. **任務一【油門起飛與定高懸停】**：起飛坪上方 10m 生成 3D 全息導引光環，爬升至指定高度平穩懸停 2 秒過關。
  2. **任務二【俯仰前進推進】**：學習俯仰控制壓低機頭，向前巡航穿過騎樓商圈 1 號光圈。
  3. **任務三【偏航旋轉航向控制】**：學習機頭偏航（Yaw）旋轉轉向，校正航向穿過 2 號平交道光圈。
  4. **任務四【橫滾左右平移側飛】**：學習橫滾（Roll）側移不轉向平飛，側身穿過 3 號轉角光圈。
  5. **任務五【增壓加速與空中急煞】**：在市民大道直道長距離衝刺（Boost），並在光圈前按 Space 氣動急煞定點懸停。
  6. **任務六【綜合返航與精準降落】**：綜合運用技巧返航中央 [H] 停機坪，緩降接地穩定靜止 1.1 秒完成考照。
- **HUD 即時互動教學指示卡**：
  - 依據當前單雙手鍵位模式（Dual/Single），動態顯示專屬按鍵提示標籤（`<kbd>` 樣式）。
  - 即時顯示懸停計時倒數百分比與航線距離進度條。
- **鍵盤可視化鍵盤連動提示（Guided Keycap Highlighting）**：
  - 任務進行時，下方虛擬鍵盤對應之操作按鍵自動進入「金色霓虹脈衝呼吸發光（`.hint-active`）」狀態，直觀指引操作。
- **學院結業考照合格證書 (Pilot Proficiency Certificate)**：
  - 結算 Modal 改為頒發合格證書，呈現 AAA/AA/A 飛行員評級、六大科目合格徽章、總耗時與碰撞次數。
- **智能步驟安全復位（Smart Respawn）**：
  - 在訓練模式下按 `R` 鍵，自動安全重置回「當前訓練步驟之起點」，大幅降低撞牆後的受挫感。

### v2.81：天空視覺純化與擬真水滴粒子系統重構
- **移除遠景大片雲朵群**：
  - 移除地平線南側之 `toweringCumulusGroup`（35 顆大型球體網格），使都會上空視野開闊通透，還原純淨洗鍊的天空漸層。
- **徹底排除「方形雨滴」問題**：
  - **成因剖析**：WebGL 預設之 `THREE.PointsMaterial` 在未綁定紋理時，底層光柵化會將每個頂點繪製為軸對齊之正方形像素 Quad，粒子尺寸放大時會呈現明顯的像素方塊感。
  - **重構解法**：導入純代碼 Canvas 2D 程式化生成修長水滴貼圖（`createRainDropTexture()`），具備空氣動力學水線長橢圓造型、抗鋸齒平滑半透明漸層與高光圓形水珠核心，並設定 `LinearFilter` 與 `alphaTest`，徹底消除方塊邊角，呈現飄逸逼真的雨水穿梭質感。

### v2.90：野外戰場戰術打擊模式 (Tactical Strike & Tank Destroyer Mode)
- **全新獨立戰場模式**：
  - 於主選單新增第 4 模式「💥 野外戰場：坦克打擊」（`tactical_strike`），提供 $450\text{m} \times 450\text{m}$ 程式化高低起伏丘陵開闊地形與前進武裝整備站（FARP）。
- **純代碼軍事戰術目標 (Zero External Mesh)**：
  - **巡邏重裝坦克（Alpha & Bravo）**：具備複合傾斜裝甲、履帶負重輪、120mm 滑膛砲、獨立砲塔動態旋轉搜索 AI 與越野路徑巡航。
  - **戰略防空雷達站**：旋轉拋物面天線、四角鋼架發射天線與混凝土掩體。
  - **前線高爆彈藥庫**：迷彩防護棚架與炸藥箱堆疊，被命中引發連鎖二階殉爆巨型火球。
- **雙聯裝空射迫擊炸彈與真實物理彈道**：
  - 機腹掛載 2 枚空對地迫擊重磅炸彈，按 `B` 或 `Space` 鍵釋放。
  - 繼承無人機慣性向量速度（向前與垂直），並受重力、空氣阻力與動態風向推移，尖端四元數姿態自動對齊下墜速度軌跡。
- **CCIP (連續計算命中點) 投彈瞄準計算機**：
  - 實時離散積分預測炸彈著彈點，在起伏地形動態投影 3D 瞄準十字準星，並於 HUD 提供 TTI（Time-to-Impact）撞擊倒數與雷射鎖定變色反饋。
- **Web Audio 戰術音效實時合成**：
  - 投彈金屬脫扣聲（`playBombRelease`）、高空下墜杜普勒嘯叫聲（`playBombWhistle`）與巨型粉紅噪訊爆震衝擊波（`playExplosion`）。
- **FARP 前線武裝補給與戰損結算**：
  - 懸停於原點 FARP 停機坪可在 1.5 秒內完成 2/2 炸彈全自動再裝填。
  - 殲滅 4 大作戰目標後返航降落觸發「戰術行動評估報告」，呈現 S/A/B 戰術評級、投彈命中率、總耗時與彈藥消耗。

---

### v2.91：飛行暫停面板
- `Esc` 顯示飛行設定與操控說明。「回主選單」回到原有模式選擇。較小視窗可捲動選單內容。

### v2.92：野外丘陵場景重構
- 建立谷底道路、補給區、林帶和雷達站等連續地景。整合野外航圖、地形高度與碰撞隔離。

### v2.93：林帶與多階段爆炸特效
- 樹冠增加層次，爆炸改用分階段閃光、火焰、揚塵及風向煙團。

### v2.94：枝葉與可破壞目標
- 加入可辨認的分枝和透空葉片，加大爆炸火光與揚塵。受毀目標產生會落地的殘骸，重開時復原。
- 已在瀏覽器以直接觸發命中的方式驗證坦克、雷達和彈藥庫的部件分離、殘骸落地與重開清理。此驗證涵蓋爆破流程，完整任務仍需另行試跑。

### v3.07：任務簡報與視角切換
- Mode 4 任務卡名稱為「戰場投彈」。進入場景後先置中顯示「山谷前線行動」簡報，依序呈現背景資訊、完成條件與操作提示。簡報期間隱藏飛行 HUD 與中央通知並暫停倒數。
- 飛行中隱藏 Mode 4 的航線導引，任務面板顯示各類目標擊殺數與剩餘持彈。戰車巡邏速度調為原始速度的 25%。
- 按 C 切換機後、前方與下視鏡頭。

### v3.08：下視鏡頭投彈與動態氣候物理彈道系統
- 開放下視鏡頭投彈功能，按 B 鍵全視角投彈。
- 下視鏡頭連動 CCIP 3D 著彈點預測。
- 引入三維運動慣性、空氣阻力、終端墜速、6 大氣候動態風偏與尾翼氣動對齊。

### v3.09：軍規下視光學分劃、動態風偏向量、光學變焦與引信安全機制
- 下視專屬軍規光學瞄準十字分劃板 (MIL-Grid Reticle)。
- 動態風偏指示向量 (Dynamic Wind Deflection Vector)。
- 下視 1x / 2x / 4x 光學變焦（Z 鍵 / 滾輪）。
- 彈藥改裝安全引信機制（未滿 6m 啞彈）與低空近距爆炸氣流衝擊波反噬。

### v3.10：軍規熱成像 (FLIR)、夜視 (NVG) 與真實圖傳噪點光學暗角系統
- **軍規熱成像與微光夜視光學系統 (Military FLIR & NVG Mode)**：
  - 支援按 <kbd>X</kbd> 鍵或點擊 HUD 按鈕循環切換 3 大感光模式：
    1. **☀️ 彩色可見光 (Visible RGB)**：標準全彩光學。
    2. **🔥 白熱熱成像 (White-Hot FLIR)**：戰術冷灰階高對比度畫面，巡邏坦克引擎、履帶摩擦點與發動中的雷達發射天線散發白熱輻射高光（`armorMat.emissive`），高空偵察目標一目了然。
    3. **🟢 微光夜視 (NVG Green Phosphor)**：第三代軍規磷光夜視綠色增強，高對比夜戰視野。
  - 整合切換時機械式紅外濾光片（IR-Cut Solenoid）雙重微型電磁卡嗒音效（`playIRCutClick`）。
- **真實無人機圖傳噪訊、光學暗角與鏡片物理缺陷 (VTX Noise & Lens Vignette)**：
  - **動態光學暗角（Optical Lens Vignette）**：畫面邊緣自然光量衰減，並隨光學變焦倍率動態加深（4X 模式下呈現軍規高倍率圓形鏡筒暗角）。
  - **感光元件動態熱噪點（Sensor Thermal Noise / Grain）**：輕量級 60fps 噪點畫布，在熱成像與夜視模式下自動增強顆粒感。
  - **類比圖傳微弱行掃描條紋（Scanlines）**：真實呈現 5.8GHz / 數位圖傳傳輸訊號的微弱滾動條紋。
- **無人機動態 OSD 遙測數據流 (Real-time OSD Telemetry)**：
  - 即時計算並顯示台灣真實 GPS 座標（隨無人機飛行微秒動態滾動）。
  - 機載 6S 動力電池電壓（推油門時具備真實電壓壓降物理特性）。
  - 圖傳頻段訊號強度（RSSI）與延遲動態標示。
- 通過無頭瀏覽器端到端完整測試（`test_flir_vtx.py` 與 `test_optics_arming_shockwave.py`）驗證通過。

### v3.11：軍規熱成像、夜視、動態 OSD 遙測與下視分劃板微型底板
- 實現下視瞄準分劃板四角讀數、光學變焦、感測鏡頭切換與引信安全邏輯。

### v3.12：恢復畫面簡潔開闊視野，強化下視瞄準具原位文字可視性
- 移除螢幕底部中央大卡片，四角括號整合航電數據。

### v3.13：真實軍規零遮擋（Zero-Occlusion）HUD OSD 字符勾邊渲染規範
- 移除四角毛玻璃底板，文字採用 2.8px 黑色實心勾邊。

### v3.14：準星中央淨空，側風數據移至外圍軍規遙測角標
- 移除中央浮動字元，風速整合於右上角角標。

### v3.15：全戰場 HUD 軍規精修（戰果進度、態勢雷達目標圖標、戰術指揮條與垂直留白）
- **左上角計時卡片殘留數據修復（Mode-Aware Sub-Stats）**：
  - 徹底解決戰場打擊模式下殘留顯示「任務進度: 0 / 6（穿門）」與「碰撞: +0.0s（罰時）」的問題。
  - 進入【坦克打擊】自動轉為：`打擊戰果: 0 / 4` 與 `剩餘彈藥: 2 / 2`（青色高亮），數據精準統一。
  - 飛行訓練與競速模式下則自動維持原本之門點進度與碰撞計次。
- **右下角戰術態勢雷達敵軍目標圖標（Tactical Situation Map Radar）**：
  - 標題在戰場模式下自動切換為 `戰術態勢雷達 (北方朝上)`。
  - 徹底告別過去未標明身分的單一紅點，改為標準軍規戰術圖標：
    - 🛡️ **FARP**：綠色圓形起降基點與名稱。
    - 🪖 **巡邏坦克**：紅色實心圓配合動態編號 `T1`、`T2`。
    - 📡 **雷達站**：紅色旋轉 45 度菱形標誌配合雷達波紋與 `RADAR` 標籤。
    - 📦 **彈藥庫**：紅色軍事防護方塊與 `DEPOT` 標籤。
    - 💥 **擊毀目標**：自動轉為深灰十字標記（如 `T(滅)`、`R(滅)`、`A(滅)`）。
- **頂部戰術橫幅軍規化視覺重構（Tactical Command Banner）**：
  - 移除濃重紅黑漸層與街機遊戲 Emoji（`💣`、`🎯`）。
  - 改為軍用暗碳玻璃薄條（`rgba(11, 19, 32, 0.88)`），配備精巧軍規膠囊：
    - `ORD: 2 / 2`（金琥珀掛載數）
    - `CCIP 解算: 預測瞄準 (TTI: 2.7s)`
    - 目標芯片：`[TANK 坦克 0/2]`、`[RADAR 雷達 0/1]`、`[DEPOT 彈藥庫 0/1]`，擊毀達標後自動亮起翠綠色完成光暈。
- **1080p / 筆電螢幕垂直呼吸空間（Optimized Vertical Margins）**：
  - 將下視瞄準具自適應收縮為 `width: min(440px, 62vw); height: min(315px, 44vh);`。
  - 解決過去在 1080p / 768p 筆電螢幕上，瞄準具上下邊緣與頂部卡片、底部卡片互相擠壓的問題，釋出約 50px 的充裕垂直呼吸空間。
- 通過 Edge 端到端自動化測試（`scratch/verify_hud_1_4.py`）驗證通過。

### v3.17：軍事擬真投彈手感（CCIP 方位引導線、航電卡片自動淡化）與視距外索敵導引（BVR Target Cueing）
- **下視鏡頭飛控遙測卡自動淡化（Adaptive Telemetry Dimming in Nadir View — Item 5）**：
  - 徹底解決下視鏡頭模式下左下角飛控數據卡與瞄準具四角角標 `AGL` 重複顯示的視覺冗餘。
  - 當切換至下視鏡頭（`state.cameraMode === 'down'`）時，左下角飛控數據卡自動平滑淡化至 `opacity: 0.32`（並施加低飽和度濾鏡），將飛手視覺自然引導至中央光學瞄準具。
  - 切換回機後視角或前視 FPV 鏡頭時，立即平滑恢復 `opacity: 1`；游標懸停（hover）時亦可瞬間清晰查看完整動力數據。
- **軍規 CCIP 彈著方位引導線（ASL / Bomb Fall Line & CCIP Vector — Item 6）**：
  - 在下視軍規分劃板（`#nadir-optics-svg`）中正式實裝現代戰鬥機與無人機標準之 **ASL（Azimuth Steering Line / 彈著方位引導線）**。
  - 細虛線自十字準星中央光學原點（0, 0）動態延伸至 CCIP 三維著彈預測點，真實反映投彈時的無人機三維飛行慣性速度、機頭旋轉角、俯衝姿態及即時氣候側風偏流。
  - 彈著點配備動態 CCIP 瞄準環與狀態標籤（正常預測：珊瑚紅 `#ef4444`、目標鎖定：翠綠光芒 `#10b981`、低空引信未解保：金琥珀 `#f59e0b`）。
- **視距外敵軍目標邊緣戰術指引箭頭（BVR Target Cueing Pointers — Item 7）**：
  - 在下視鏡頭模式下，針對尚未進入光學視野（Off-Screen）的活躍敵軍目標（重裝坦克 T1/T2、防空雷達 RADAR、彈藥庫 DEPOT），於分劃板邊界動態生成軍規向量導引箭頭與距外測距標籤（如 `T1 61m`、`RADAR 143m`）。
  - 採用半透明深碳戰術膠囊背景（`rgba(10, 17, 28, 0.88)`）與精巧角度旋轉箭頭，杜絕與邊角航電文字重疊。
  - 當無人機飛抵目標上方進入可見光學分劃框內時，指標自動隱藏，確保十字瞄準具清晰乾淨；目標被擊毀後即刻停止追蹤。
  - 全程零表情符號，嚴格維持軍規航電專業通訊標準。
- **快取更新與自動化測試**：
  - 升版至 `style.css?v=3.05` 與 `app.js?v=3.18`。
  - 通過 Edge DevTools Protocol 端到端全項目自動化驗證（`scratch/verify_items_5_6_7.py`）。

### v3.16：全面淨化 HUD 表情符號（Zero-Emoji Aviation Compliance）與 PLAYER 紅點置中對齊
- **HUD 介面表情符號全面淨化 (Zero-Emoji Military HUD Standard)**：
  - 徹底移除左上角模式徽章（Mode Badge）之遊戲表情符號（移除 `💥`、`🎓`、`⏱️`、`⚔️`、`🕊️`），改為專業軍規文字標籤（`坦克戰術打擊`、`飛行操控訓練`、`單人競速挑戰`、`雙人輪流競速賽`、`城市自由空拍`）。
  - 徹底移除頂部 CCIP 著彈預測前綴表情符號（移除 `⚠️` 與 `🎯`），改為標準電文格式：`CCIP: 預測瞄準 (TTI: 2.7s)`、`CCIP: 鎖定 目標名 (TTI: Xs)`、`CCIP: 投彈高度過低 (預估啞彈 TTI: Xs)`。
  - 下視鏡頭 VTX 圖傳遙測移除 `📶` 表情圖標，改為國際標準圖傳代號 `VTX: -42dBm`。
  - 感光與氣候遙測標籤同步淨化，移除所有花俏圖示，還原純粹軍事戰術航空儀表風貌。
- **PLAYER 錄影紅點像素級垂直置中對齊 (Pixel-Perfect Vertical Centering)**：
  - 修復 `.player-badge` 內 `.rec-dot` 與 `PLAYER 1` 由於字型基線與大寫字母（Cap-Height）未對稱導致之視覺偏差。
  - 採用 `display: inline-flex; align-items: center; line-height: 1;`，並加入微調 `top: -0.5px`，消除無下行筆畫（descender）之全大寫英文字體產生的幾何重心偏移。
  - 經由 Edge CDP 無頭瀏覽器實時量測：`.rec-dot` 中心 Y 軸 (42.00px) 與 `PLAYER 1` 中心 Y 軸 (42.50px) 垂直偏差縮小至 0.5px 內，達到肉眼絕對置中。
- **快取更新與自動化驗證**：
  - 靜態資源同步升版至 `style.css?v=3.04` 與 `app.js?v=3.17`，確保使用者免手動強制重新整理即可載入最新航電樣式。
  - 通過 Edge DevTools Protocol 端到端自動化測試（`scratch/verify_hud_emojis_and_alignment.py`）驗證通過。

### `app.js?v=3.19`–`3.30`　任務結算與場景效能
- 重排戰場結算與 Esc 面板，加入任務彈藥上限、逐發直擊率、碰撞扣分、返航加分及中止結算。
- 補齊戰場物件與城市柵欄碰撞，修正城市平交道物件進入戰場的問題。加入跨場景卸載、分段載入、野外碰撞索引及城市材質共用。

### `app.js?v=3.31`–`3.45`　城市裁減與戰場地景
- 城市縮為 430 × 430 公尺，並改為選擇城市玩法後才建立。戰場更新道路、T-90MS 風格戰車、雷達站、彈藥庫、軍用任務型四軸無人機與臨時放飛點。
- 加入微光夜視增益、局部白熱熱源與冷卻效果，細化焦痕、殘骸、地面與植被。移除容易被看成石塊的實心樹冠填充，將岩石和碎礫移出樹冠範圍。

### `app.js?v=3.46`–`3.47`　樹種差異與瞄準疊圖
- 加入三種樹形、樹皮與枝葉紋理。修正三種感測模式下場景落點標記被物件遮擋，並將陣地聯絡道路收在混凝土平台外。
- 程式層驗證涵蓋場景往返、資源清理、碰撞、結算、樹種生成及最新版道路網格和落點標記設定。近期場景的實際畫面、切換至首幀時間、飛行幀率與顯示記憶體用量仍待瀏覽器量測。

### `app.js?v=3.70`、`style.css?v=3.22`：全局掃描線清除與 50 噸戰車滑行慣性物理
- **徹底移除類比掃描線（Analog Rolling Scanlines Removal）**：
  - 過去在 CSS `#fpv-overlay`（`repeating-linear-gradient`）與 `updateVTXOverlay` 畫布中實作的類比電視滾動掃描線，嚴重背離現代軍規/高階商用無人機（如 DJI O3/O4 數位鏈路、MQ-9 數位圖傳）之高解析數位特性，且在第三人稱視角（Chase）及日間全彩（Visible RGB）中造成干擾。
  - 徹底移除上下滾動掃描線代碼；第三人稱機後視角設為純淨直視（`opacity: 0`），停用任何濾鏡與噪點；可見光模式維持無噪點的純淨高清數位畫面；僅微光夜視（NVG）保留磷光閃爍雪花點（scintillation），熱成像（FLIR）保留微量非均勻性噪點（FPN）。
- **50 噸重裝坦克被擊中後的動量滑行物理（Tank Coasting Inertia Physics）**：
  - 修正過去坦克被航彈擊中後瞬間原地定格之不符合牛頓力學現象。
  - 實裝 50 噸級戰車慣性動力學：被擊毀瞬間砲塔被炸飛脫離，底盤依據原有行進速度以自然阻尼減速比率（約 0.82 m/s²）向前持續滑行約 1.5 ~ 2 秒（前進 2~4 公尺），負重輪與履帶隨動滾動，滑行過程中持續冒出損壞煙霧爆鳴，直至動能完全歸零停下，並在最終停止處生成車體燃燒焦痕。
- **微光夜視與月光照度平衡**：
  - 調和夜間月光照度與 NVG 增益參數，在微弱月光下提供適度地形與道路辨識度，同時突顯 FLIR 對發熱引擎與排氣熱羽流的強烈熱反差偵蒐優勢。

### `app.js?v=3.83`：彈體空間軸向修正（彈尖朝前下落）與履帶煙霧深度遮擋（Depth Cutout）根治
- **修正彈體 Lathe 幾何旋轉軸向（彈尖朝前下落修正）**：
  - 徹底排查先前彈藥在 FPV 視角中「尾翼朝前落下」之幾何反轉問題。
  - 原代碼使用 `bodyGeo.rotateX(-Math.PI / 2)`，導致旋轉矩陣將 $y=-0.32$（尖端撞針）映射至空間 $+Z$（後方），而尾翼固定在 $+Z$，造成彈體與尾翼相反。
  - 修正為標準 `bodyGeo.rotateX(Math.PI / 2)`，使彈頭精確位於空間 $-Z$、尾翼與導流環位於 $+Z$。
  - 調整掛架微仰俯角為 `bomb.rotation.set(-0.095, 0, 0)`（彈尖向前微傾 5.5°）。
  - 下落時 `idealQuat` 精確將 $-Z$ 軸向鎖定相對速度向量 $\vec{v}_{rel}$，使**尖端引信筆直朝下鑽向地面，尾翼與環形導流罩在後方迎風穩定拖曳**。
- **根治履帶接觸路面之矩形破圖 / 遮擋色塊（Depth-Buffer Cutout Fix）**：
  - 排查附圖中坦克受損履帶後方路面出現之半透明矩形破圖問題。
  - 原因為先前調用之 `createDudBlastEffect` 缺少 `depthWrite: false`，導致透明看板精靈（Billboard Sprites）在俯視相機下近乎水平切入路面並寫入深度緩衝區，阻擋了路面與履帶像素渲染。
  - 為受損坦克實裝專屬的 `createTrackDamageSmoke(x, y, z, patrolDir)` 系統，全面啟用 `depthWrite: false`，煙霧自然向上向後漂浮消散，絕不寫入深度緩衝區，徹底消除路面破圖。
  - `createDudBlastEffect` 同步補齊 `depthWrite: false` 保護。
- **現代 82mm 空投改裝迫擊砲彈幾何建模（82mm Modified Aerial Mortar Geometry）**：
  - 徹底重構舊版簡陋圓柱模型，採用真實軍用 82-PM-37 / O-832DU 空投迫擊砲彈為原型。
  - **水滴流線鑄鐵彈身（Ogive/Teardrop Body）**：使用 `THREE.LatheGeometry` 旋轉成型，具備軍綠色（Olive Drab）消光鑄鐵外殼、紫銅定心導帶（Copper Driving Band）與黃色 TNT 高爆色環。
  - **尖端碰炸引信與解保結構（Impact Nose Fuze & Vane）**：前置鋼質撞針，並配備現代戰場經典的 3D 列印安全解保風輪（Safety Orange Arming Vane）。
  - **尾翼與空投導流罩（Tail Boom & 3D-Printed Shroud Ring）**：尾管配備 6 片金屬徑向穩定薄尾翼，外圍包覆烏克蘭實戰標誌性的 3D 列印空投導流環（Ring Fin / Shroud），顯著提升空投下落辨識度與軍事臨場感。
- **四軸無人機機腹平臥雙導軌掛載（Horizontal Underbelly Dual-Rail Pylons）**：
  - 維持玩家喜愛的四軸作戰無人機，但將掛載方式從垂直吊掛升級為**水平平臥前傾掛載（Forward-Slanted Horizontal Mount，微前傾 5.5°）**。
  - 機腹新增碳纖雙導軌掛架、金屬伺服卡扣（Servo Clamp & Release Pins）；炸彈收納於起落架淨空區內（離地 >0.35m），杜絕降落撞地與平飛風阻。
  - 保持最大 2 枚實戰掛載，依序左右對稱脫鉤（右側先脫鉤、左側後脫鉤），維持機身重心平衡。
- **高擬真彈藥下落翻轉物理與擺動衰減（Full Aerodynamic Pitch-Down & Wobble Dynamics）**：
  - **初速與姿態繼承**：脫鉤第 0 瞬繼承無人機空間 3D 向量速度與當前空間傾角，施加垂直分離微動量。
  - **氣動恢復力矩（Pitch-Down Torque）**：依據相對風速（Airspeed）動態計算升力矩與壓心（CP）/重心（CG）偏移，隨下墜速度增加迅速將彈尖向合速度拋物線切線方向低頭翻轉。
  - **阻尼衰減擺動（Damped Oscillation Wobble）**：模擬彈體翻轉慣性過衝，在脫離後 0.15 ~ 0.7 秒內呈現真實氣動擺動（$e^{-3.2t} \sin(14t)$），並隨空氣阻尼平滑消除。
  - **軸向微自旋（Spin Stabilization）**：彈體沿縱軸微速自旋穩定。
  - **CCIP 著彈預測同步**：投彈分離衝量與空氣動力模型精準映射至 CCIP 演算法，預測點依然達到絕對精確。
- **精細化打擊傷害與裝甲履帶癱瘓機制（Mobility Kill Mechanics）**：
  - **頂攻致命直擊（Top-Attack Direct Hit）**：砲塔/頂部直擊（距離 $\le 3.8\text{m}$）造成 100 點滿額毀傷，直接觸發殉爆掀翻砲塔。
  - **近距破片破壞（Splash Damage）與履帶癱瘓（Mobility Kill）**：近距落彈造成 25~55 點破片傷害；若巡邏坦克生還，將立即觸發「履帶斷裂癱瘓」，巡邏速度驟降至 38%，並自受損履帶斷續噴出黑煙，大幅提升戰術補刀與策略深度。
  - 任務重置時自動復原坦克巡邏基準速度與履帶狀態。
- **徹底廢除二戰好萊塢式吹哨笛音（`playBombWhistle` 移除）**：
  - 徹底移除舊代碼中仿照二戰斯圖卡俯衝風笛或二戰航彈尾翼哨子的 `1150Hz -> 260Hz` 尖銳滑音與反物理漸響曲線。
  - 現代軍用改裝無人機彈藥無發聲哨，彈藥下墜全程保持寂靜（僅有無人機電機運轉風聲），符合真實戰場的無聲冷酷感。
- **實裝軍規脫鉤機械與 HUD 遙測確認音（`playBombRelease` 重構）**：
  - 機載微型脫鉤伺服器釋放插銷之機械「喀嗒」（Mechanical Servo Click，680Hz -> 140Hz 快速衰減）與彈體離架微弱低頻彈跳音。
  - 飛手 FPV 耳機 / 地面控制站（GCS）的專業軍規遙測電子確認音（`1920Hz -> 2450Hz` 短促雙頻 Chirp，標示 "ORD RELEASED" 掛載脫離）。
- **依據觀察者視角區分爆炸聲響物理特性（Camera-Aware Explosion Acoustics）**：
  - **第三人稱機後視角（Chase View）**：模擬外部戰場環境，保留全頻段的震撼爆炸聲、破片雜音與重低音衝擊。
  - **下視光電打擊視角（Nadir Optical View）**：模擬高空光電吊艙與地面站監控視角，大氣與遠距離天然濾除尖銳高頻（>115Hz 深度低通濾波），呈現沉悶、厚重的遠距低頻氣壓震盪波（Sub-Bass Shockwave Rumble），極具高科技現代軍用光電作戰臨場感。

---


### v3.83：迫擊砲下落姿態座標系獨立解耦與場景載入面板純粹化 (2026-11-12)
- **彈藥下落動態姿態徹底解耦（Orientation Decoupled from World Axes）**：
  - **根本原因**：先前使用 `idealQuat.setFromUnitVectors(new THREE.Vector3(0, 0, -1), targetDir)`，強制以世界北方 (`0, 0, -1`) 作為初始參考基準。當無人機航向（Yaw）不為 0（例如轉向南、東、西側接近目標或懸停盤旋）時，插值計算會強行拉扯彈體橫滾與偏航角，甚至在朝南時發生 180° 翻轉倒置，導致飛手在機後第三人稱或 FPV 視角下觀察到「彈尾朝前/逆向倒栽蔥」的異常現象。
  - **修復方案**：改採**座標系無關之向量即時對齊矩陣**。取得彈體當前在世界空間中的真實彈頭指向向量 `currentNose = (0, 0, -1).applyQuaternion(b.quaternion)`，計算當前彈尖到速度向量 `targetDir` 之最短旋轉軸 `rotAxis = currentNose.cross(targetDir)` 與夾角，藉由 `b.quaternion.premultiply(deltaQuat)` 動態旋轉。
  - **物理效果**：不論無人機以何種航向（0°~360°）、俯仰或側滾進入投彈點，脫鉤後的 82mm 迫彈均能在其自身的瞬時飛行軌跡平面內自然、平滑地低頭俯衝（Nose Down），彈頭引信永遠鎖定飛行軌跡前緣，尾桿、6 片安定尾翼與導流環則穩定朝向相對迎風面後方，懸停投彈時亦呈現垂直彈頭朝下姿態，徹底消除了視角異常。
  - **修正引信撞針幾何倒角**：修正 `strikerGeo` 圓柱頂部與底部半徑順序，確保尖端細針（0.006m）精準指向空間前沿。
- **場景載入面板精簡純粹化（World Loading Overlay Streamlining）**：
  - 隱藏載入場景時的大標題（`#world-loading-title { display: none !important; }`）。
  - 載入場景時畫面僅保留流暢進度條（`<progress>`）與分段階段說明細節文字（`#world-loading-detail`），視覺更加乾淨、專注。

---

### v3.84：硬核擬真四軸空氣動力學與四階龍格-庫塔（RK4）外彈道解算引擎 (2026-11-12)

- **二階旋轉彈簧阻尼姿態動力學（2nd-Order Rotational Spring-Damper Attitude Dynamics）**：
  - 捨棄過往瞬間一階線性插值（1st-order lerp）之簡化傾角控制，在 [`updateDronePhysics`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6783) 中導入具真實角速度（`drone.pitchRate`、`drone.rollRate`）與角加速度的二階半隱式歐拉（Symplectic Semi-Implicit Euler）2-substep 子步進積分：$\alpha = \omega_n^2(\theta_{\text{target}} - \theta) - 2\zeta\omega_n\dot{\theta}$。
  - 自穩定高模式（`stabilized`，$\zeta = 0.88$）具備高阻尼沉穩收斂；運動模式（`sport`，$\zeta = 0.76$）則呈現真實飛控 PID 在急停與大角度翻轉時的微幅慣性過衝與回彈手感。
- **推力向量傾角推進與大傾角升力衰減（Thrust-Vector Tilting & Bank-Angle Lift Loss）**：
  - 水平推進加速度改由實際旋翼盤空間傾角分量 $\sin(\text{pitch}), \sin(\text{roll})$（72% 權重）與搖桿前饋（28% 權重）耦合驅動，並疊加旋翼揮舞線性阻力（Blade-Flapping Drag）與機體二次方寄生風阻（Quadratic Parasitic Drag）。
  - 實裝傾角垂直升力損耗 $\cos(\text{pitch})\cos(\text{roll})$：在 `sport` 模式下進行大角度高速側傾切彎時，垂直升力分量下降會產生真實的高 G 掉高（Altitude Sink），需由飛手主動補油門維持高度。
- **Cheeseman-Bennett 地面效應氣墊（In-Ground Effect, IGE）與渦環狀態（Vortex Ring State, VRS）**：
  - **地面效應（[`computeGroundEffectFactor`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5383)）**：當離地高度 $\text{AGL} < 3.4\text{m}$ 時，依據 Cheeseman & Bennett 旋翼下洗氣墊公式 $k_{\text{IGE}} = [1 - (R_{\text{eff}} / 4z_{\text{AGL}})^2]^{-1}$ 提供最高 $+28\%$ 的貼地氣墊升力緩衝與下降阻尼，使FARP 精準降落更具真實空氣壓縮支撐感。
  - **垂直急降渦環狀態（VRS）**：當無人機於高空（$\text{AGL} > 4.0\text{m}$）且低水平空速（$< 3.2\text{m/s}$）下以超過 $-6.0\text{m/s}$ 垂直急降時，機體陷入自身下洗渦流，觸發真實橫滾/俯仰亂流抖動（Roll/Pitch Buffeting）與升力喪失下陷；推桿加速水平前飛即可脫離渦環（Vuichard / 前飛改出）。
- **彈藥掛載質量慣量比與非對稱脫鉤反衝（Payload Mass Ratio & Asymmetric Release Recoil）**：
  - 實裝空機 $8.5\text{kg}$ 與雙聯裝 $82\text{mm}$ 迫擊砲彈（每枚 $1.6\text{kg}$，滿載 $+3.2\text{kg}$）之動態質量比 `drone.massRatio`，重載時自動縮放機體轉動慣量、水平加速度與爬升率。
  - 投彈瞬間（[`dropBomb`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5573)）依據脫鉤掛架之左右偏心位置（右側先脫、左側後脫），對機體施加真實向上減重反衝（$+0.42\text{m/s}$）與非對稱橫滾/俯仰角衝量（`drone.rollRate`、`drone.pitchRate`），每投出一枚砲彈機體隨即變得更加輕巧靈敏。
- **大氣邊界層高度風切梯度與真實四軸抗風姿態／陣風揮舞耦合物理（Wind-Shear, Auto-Crab Wind Lean & Blade-Flapping Gust Dynamics, v3.90）**：
  - 實裝 [`computeWindShearMultiplier`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5468) 指數風切剖面 $f_{\text{shear}}(h) = \text{clamp}((h/18)^{0.16}, 0.68, 1.38)$：貼地樹梢高度受地表摩擦遮蔽風速較弱（約 $0.70\times$），高空 $60\text{m}$ 以上則遭遇強勁高空風切（約 $1.21\times$），並同步反映於下視瞄準具右上角 `W: X.Xm/s` 即時風速遙測。
  - **自穩模式抗風傾角補償（Flight Controller Wind-Compensation Crab Angle）**：於 [`updateDronePhysics`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L7208) 將世界風向量投影至機體座標軸（`meanFwd`、`meanRight`）。在 `stabilized`（自穩定高）模式下，模擬真實 GPS/光流定點飛控主動將機身**迎風壓傾（Windward Crab Lean）**（陰天微風約 $1.9^\circ$、細雨約 $3.5^\circ$、豪雨約 $5.3^\circ$、颱風約 $7.5^\circ \sim 11^\circ$），由旋翼傾角分量自然產生抵消平均風阻的水平反推力；而在無定點輔助的 `sport` 模式下則不自動壓傾，機體將直接隨氣團下風漂移（颱風下可達 $7.5\text{ m/s}$），需由飛手手動推桿頂風修正。
  - **陣風旋翼揮舞效應（Rotor Blade-Flapping Dihedral Tilt）與側風風標偏航力矩（Weathercocking Yaw Torque）**：當瞬時陣風脈衝（`gustFwd`、`gustRight`）與風向擺動（Wind Veering）襲來時，前行槳葉與後行槳葉升力差會瞬間將機身往順風側掀動並伴隨大氣渦旋角加速度擾動（`turb`）、垂直風切升降氣流（`vertShear`）與機尾/彈翼之側風風標偏航拉扯；未起飛停放於地面（`AGL < 0.12m`）時則由起落架摩擦鎖定，防止停機滑移。
- **四階龍格-庫塔（RK4）外彈道數值積分與樹冠氣動阻滯（RK4 Ballistics & Canopy Retardation）**：
  - 新增 [`stepBombRK4`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5485) 與 [`evaluateBombAccel`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5446)，讓 CCIP 預測（[`calculateImpactPoint`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5526)）與實體炸彈飛行（[`updateActiveBombs`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5614)）共用同一套高精度 RK4 數值積分核心與次步長地面交點內插（Sub-step Ground Intersection Interpolation）。
  - 完整耦合：氣壓高度空氣密度衰減 $\rho(y) = \rho_0 e^{-y/8500}$、高度風切梯度、尾翼未對齊前之非線性阻力曲線、Magnus 側向氣動耦合、機體角速度切線拋出初速（$\boldsymbol{\omega} \times \mathbf{r}$），以及**穿透樹冠減速偏折（[`sampleCanopyBallisticDrag`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5389)，依針葉/疏葉/闊葉樹冠碰撞體提高 $2.4\times \sim 3.8\times$ 氣動阻力與亂流偏折）**。
- **HUD 飛控氣動狀態即時遙測（`#hud-throttle-state`）**：
  - 左下角垂直升降卡動態顯示當前氣動狀態：`渦環亂流 VRS`（紅字警示）、`地面效應 IGE +X%`（翠綠提示）、`掛載 +3.2kg / +1.6kg`（戰術掛載提示）或 `自動定高 / 運動手動`。

---

### v3.86：軍規多軸飛控渦環保護（VRS Protection）與三軸光電雲台防抖物理調校 (2026-11-12)

- **非對稱升降速率與飛控垂直下降限幅（`maxClimbSpeed` / `maxDescentSpeed` / `hoverDescentLimit`）**：
  - 貼合真實軍規四軸飛控（PX4 / ArduPilot / 軍用戰術機載飛控）韌體行為：爬升時旋翼將氣流向下排開，極速可達 `16.0 m/s`（`stabilized`）/ `24.0 m/s`（`sport`）；而在原地無水平速度垂直急降時，自穩飛控主動將垂直下降率限制於 `hoverDescentLimit = 7.5 m/s`（邊界安全區），僅在具備水平空速（前飛/側飛斜面下降 $>4.5\text{m/s}$）或切換至 `sport` 模式時解鎖高速下降。
- **尾流累積時間常數（Progressive Wake Accumulation）**：
  - 渦環亂流並非瞬間生成，需在原地無風垂直急降持續約 `1.5s` 以上才會逐步累積尾流渦環強度（`vrsSeverity`）；一旦推桿產生水平空速（`horizAirspeed > 2.0 m/s`），尾流渦環即以 $3.8\times$ 速率快速吹散改出。
- **400Hz 飛控 PID 高頻微震顫與三軸陀螺穩定光電吊艙（3-Axis Gyro Gimbal Isolation）**：
  - 將 VRS 姿態擾動由誇張的大幅搖晃改為真實四軸飛控 PID 與尾流對抗的高頻微幅震顫（`stabilized` 模式限制於 $\pm 3.2^\circ$，`sport` 模式限制於 $\pm 5.8^\circ$），主要體現為「垂直下沉率突然增加、補油門反應變鈍（升力衰減最高 38%）」。
  - 下視光電/紅外線瞄準吊艙（`down` 視角）模擬真實三軸無刷陀螺增穩雲台（3-Axis Gyro-Stabilized EO/IR Gimbal），完全隔離機身震顫，確保高空光電鎖定與投彈畫面穩定清晰。

---

### v3.87：程序化 HDR 環境光照（IBL）、大氣米氏散射天穹、4K 像素對齊跟隨陰影與爆炸動態火光 (2026-11-12)

- **程序化 HDR 物理環境反射光照（Procedural PBR IBL via `THREE.PMREMGenerator`）**：
  - 新增 [`getProceduralEnvMap`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L622)，以 6 面 Canvas 2D 漸層 `THREE.CubeTexture` 搭配 `pmremGenerator.fromCubemap(cubeTex)` 烘焙環境貼圖並快取於 `envMapCache`（避免在 Windows ANGLE / D3D11 下 `PMREMGenerator.fromScene` 對自訂 `ShaderMaterial` 進行球面摺積時因 `pow(0.0, y)` 產生 `NaN` 污染而導致全場 `MeshStandardMaterial` 黑屏）。
  - 自動綁定至 `scene.environment`，使無人機碳纖維機臂、82mm 迫擊砲彈紫銅導帶與鋼製撞針、重裝坦克裝甲、城市車輛烤漆與玻璃帷幕在夏日晴空、夕陽與夜間皆呈現真實物理環境反射（切換至 `flir_white` 白熱紅外線模式時自動設為 `null`，確保純淨熱源對比度）。
---

### v3.89：大氣瑞利/米氏前向散射天穹與六大天候動態雲層形態學 (2026-11-12)
- **大氣瑞利/米氏前向散射天穹與六大天候動態雲層系統（Rayleigh + Mie Sky Dome & Multi-Weather Cloud Morphology Shader）**：
  - **黃昏自然金珀色溫校正（Golden-Hour Dusk Palette）**：移除舊版過於刺眼的洋紅/正紅色調（`0xe11d48`）與紫地光，改為暮色黛藍天頂（`0x243b55`）、暖金珀色中天（`0xc28d64`）、香檳金地平線（`0xf2c57c`）與自然暖褐地面漫反射（`0x383228`）。
  - **六大天候專屬天色、雲量與雲種形態學（`weatherAtmosphere` + `sampleCloudField`）**：於 [`buildAnimeSky`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L3399) 與 [`applyTimeOfDay`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L3840) 實裝隨天氣動態切換的雙層雲系（高空冰晶卷雲 `cirrusStrength` + 中低空動態雲層 `cloudCoverage` / `cloudType`）與向陽自陰影（Directional Self-Shadowing & Silver Lining）：
    - `clear`（晴朗）：湛藍晴空 + 高空羽毛狀卷雲絲（`cirrus = 0.28`）+ 蓬鬆白亮之**晴空淡積雲（Cumulus Humilis，`coverage = 0.22, cType = 0.0`）**。
    - `cloudy`（多雲）：柔和灰藍天色 + 立體自陰影濃厚之**層積雲與濃積雲群（Stratocumulus，`coverage = 0.64, cType = 0.32`）**。
    - `drizzle`（微雨）：陰雨灰藍天色 + 水平延展成片之**高層雲與雨層雲（Altostratus / Stratus，`coverage = 0.80, cType = 0.65`）**。
    - `heavy_rain`（豪雨）：深沉鉛灰暴風雨天色 + 翻湧烏黑雲底之**積雨雲（Cumulonimbus / Nimbostratus，`coverage = 0.92, cType = 0.86`）**。
    - `fog`（濃霧）：乳白灰霧天穹 + 均勻低垂的**霧層雲（Stratus Nebulosus，`coverage = 0.95, cType = 0.52`）**。
    - `typhoon`（颱風）：昏暗炭灰天色 + Domain-Warping 劇烈渦旋拉扯之**颱風眼牆暴風黑雲帶（Typhoon Supercell Bands，`coverage = 0.97, cType = 1.0`）**，且雲層每幀隨實際風速與風向向量（`cloudOffset`）動態飄移。
---

### v3.93：大氣景深距離衰減斜雨 Shader 與陣風雨幕系統 (2026-11-12)
- **大氣景深距離衰減斜雨 Shader 與陣風雨幕系統（Distance-Attenuated Alpha-Tapered Rain Shader & Storm Mist Curtains）**：
  - **修復靜止不動的垂直線條 Bug**：先前 `applyWeather` 設定的繪製數量（`1800 / 4200 / 6000`）大於 `WEATHER_PROFILES` 的 `w.rainCount`（`1600 / 3600 / 5200`），導致末尾 `200 ~ 800` 根線段未被 `updateRain` 更新而停留在初始垂直位置。現已將 `setDrawRange(0, activeDrops * 2)` 與 `updateRain` 迴圈上限嚴格同步為 `Math.min(w.rainCount, MAX_RAIN_PARTICLES)`，確保 `stationaryCount = 0`。
  - **自訂距離淡出與尾端透明漸層 Shader（[`buildRainSystem`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L3699)）**：移除舊版過亮刺眼的 `AdditiveBlending` 與 `4.35m` 長白線，改用自訂 `THREE.ShaderMaterial`（`NormalBlending`），具備：
    1. **尾端 Alpha 歸零漸層（`aAlpha`）**：雨絲下端水滴尖端半透明（`0.55~1.0`），上端尾跡平滑淡出至 `0.0` 完全透明，消除生硬截斷感。
    2. **攝影機景深距離衰減（`distFade`）**：僅在鏡頭前 `4.2m ~ 32m` 範圍內呈現細緻微透雨絲（`uOpacity = 0.16 ~ 0.34`，長度 `0.5m ~ 1.4m`），超過 `32m` 自動融入遠方霧氣，不再於遠處山坡與樹林上畫出突兀白線；同時移除山坡表面不自然的白色圓點粒子。
- **4096 高解析度像素網格對齊無人機跟隨陰影（4K Texel-Snapped Drone-Following Shadow Cascade）**：
  - 將主方向光陰影貼圖升級至 `4096 × 4096`（依硬體上限自動適配），搭配精準聚焦視錐（`dRange = 135`）與 `normalBias = 0.022`。
  - 新增 [`updateShadowFrustum`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L698)，每幀跟隨無人機 $(x, z)$ 座標並對齊至世界空間陰影紋素步長（`texelWorldStep`），徹底解決遠端北側防空雷達與彈藥庫（$Z = -250$）超出陰影範圍的問題，同時消除飛行時陰影邊緣閃爍（Shadow Shimmering）。
- **野外戰場地形坡度裸岩、向陽坡面與河谷環境光遮蔽 + 雨天濕滑鏡面反光（Terrain Slope/AO & Wet Specular Sheen）**：
  - 於 [`buildWildernessLandscape`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L4908) 計算每頂點解析地形梯度（$\partial h/\partial x, \partial h/\partial z$），自動烘焙陡坡風化裸岩（`rockFace`）、向陽坡面暖色增益（`solarAspect`）與低窪河谷環境光遮蔽（`valleyAO`）。
  - 於微雨、豪雨與颱風天候下動態調降地形（`wildernessLandMat`）與戰術道路（`wildernessRoadMat`）之 `roughness` 並微幅提升 `metalness`，結合 IBL 呈現雨中泥濘路面與濕潤地表的真實水膜反光。
- **爆炸動態火球點光源與貼地馬赫震波環（Dynamic Fireball PointLight & Mach-Stem Shockwave Ring）**：
  - 於 [`createBlastEffect`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5971) 與 [`updateExplosions`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6385) 中，每次炸彈引爆或彈藥庫殉爆皆生成動態 `THREE.PointLight`（隨火球高頻閃爍與平方反比衰減照亮周圍坦克、樹林與地面）以及快速向外擴張的加法混色貼地馬赫震波環（`shockRing`），並於 [`removeBlastEffect`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5994) 完整釋放 GPU 資源。
- **重型戰車（MBT）82mm 空投迫擊彈頂攻毀傷機制、砲塔座圈焦黑彈艙破口與外部構件戰損系統**：
  - **82mm 空投迫擊彈對重裝戰車之真實毀傷判定（[`triggerExplosionAt`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6963)）**：
    1. **正面斜甲／側裙／外緣履帶命中（`62 dmg` 重創癱瘓，不會一發掀翻砲塔）**：82mm 迫擊彈單靠外爆威力無法直接憑空掀飛 12 噸重的鋼製砲塔；若命中車首重裝斜甲（Glacis）或側裙履帶區，第一發僅重創車體（殘餘 `38%` HP）、炸飛 3~4 片側裙裝甲、歪斜負重輪並鋪設斷裂履帶段、降低巡邏速度至 `28%` 並持續冒出濃黑煙，需補第二發或精準命中頂部薄弱區方能徹底擊毀。
    2. **引擎室／車頂薄甲貫穿焚毀擊毀（`TOP-ARMOR PENETRATED!`，砲塔保留於車體上）**：命中車體後半部引擎散熱百葉窗或外圍頂甲薄弱區（20~30mm 頂甲）時，一發貫穿起火擊毀；此時**砲塔不會掀飛**，而是呈現真實戰場癱瘓姿態：**砲塔卡死偏轉傾斜、主砲管因液壓喪失向下垂頭（`-13°`）、車長塔艙蓋被內爆震開、引擎室破口（`engineBreachWell`）外露並竄出持續烈焰與濃黑柴油煙柱**。
    3. **車體中央轉盤自動裝彈機大殉爆掀頂（`AMMO COOK-OFF!`，內部彈藥殉爆掀飛砲塔）**：僅在**精準命中砲塔正中央頂甲／彈藥架座圈（`turretDist <= 1.48m`）**或**第二發補刀貫穿戰鬥室中央**時，才會引燃車底轉盤彈藥架推進藥包，觸發二次連環內部大殉爆，將 12 噸砲塔向上掀翻拋飛並翻滾墜地（砲塔底部新增 `turretUnderRing` 座圈與砲尾閉鎖機結構）。
  - **車體砲塔座圈深淵破口與內部焦黑彈艙結構（[`turretRingWell`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L4730)）**：
    - 當砲塔因內部彈藥殉爆掀飛後，車體頂部不再是平坦完好的迷彩方盒，而是顯露直徑近 2 公尺的**焦黑圓形座圈深淵破口（`abyssFloor` + `ringWall` + `ringCollar`）**、12 片向外翻捲撕裂的裝甲鋼板花瓣、8 根扭曲變形的內部彈艙骨架、炸毀的轉盤裝彈機殘骸（`mangledCarousel`），以及底部閃爍脈動的暗紅／橘黃熔融餘燼（`emberBed` / `emberHotCore`）。
  - **明顯可見的車體戰損貼圖與外部構件解體（[`inflictTankBattleDamage`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6793) & [`applyTankCamoBattleDamage`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6609)）**：
    - 每次命中皆在該戰車專屬的 `256×256` 迷彩 Canvas 貼圖上即時繪製焦黑煙燻漸層、高溫氧化鐵鏽斑與放射狀破片刮痕（擊毀時全車轉為焦黑炭化與鏽蝕鋼板質感），並在命中點生成立體外翻鋼瓣彈坑（[`addTankImpactCrater`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6695)）、炸飛鄰近側裙（`skirts`）、反應裝甲磚（`deckTiles`）與儲物箱（`stowageBoxes`），以及持續燃燒閃爍的 3D 殘骸烈焰點光源與濃黑油煙柱（[`attachPersistentTankWreckFire`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6753) / [`createWreckFireSmokePlume`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L6917)）。
- **高擬真軍規防空引導雷達站（山頂制高點陣地）與前線高爆彈藥庫（山麓反斜面防爆土堤掩體）重構（Realistic Radar Summit Bastion & Reverse-Slope Ammo Depot Revetment, v3.95）**：
  - **設置地點與軍事地形學配置（[`wildernessRadarSite`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5630) & [`wildernessDepotSite`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5631)）**：
    1. **防空引導雷達站（西側主山脊制高點堡壘，`x: -116, z: -182, 標高 33.8m`）**：符合防空預警與射控雷達「佔領制高點以爭取 360° 無遮蔽低空視界（Line-of-Sight）」之準則，移設至西側主山脊最高峰平台，由蜿蜒盤山戰術車道連接；陣地周圍構築鋼筋混凝土擋土護坡基座、HESCO 防爆石籠掩體牆、北約三色迷彩 C2 指管方艙車、柴油發電機拖車、高壓電纜槽橋與附紅光防撞燈之高聳 VHF 通訊天線塔。
    2. **前線高爆彈藥庫（東側山麓反斜面山凹防爆掩體，`x: 42, z: -248, 標高 5.8m`）**：符合野戰彈藥庫「依山傍谷、隱蔽於山腳反斜面並構築三面防爆土堤（Earth-Bermed Revetment）以導引殉爆震波向上宣洩」之準則，退縮嵌入東側山麓，三面環繞 3 公尺高 U 型防爆土堤與內層 HESCO 防爆牆，庫頂兩側豎立雙座高聳防雷避雷針塔（Lightning Arrestor Towers），南向開口朝向混凝土運補裝卸坪（`ammoDepot.rotation.y = Math.PI`）、武裝哨亭與紅白升降柵欄。
  - **外型結構與塗裝細節（[`createRadarMesh`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5102) & [`createAmmoDepotMesh`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5222)）**：
    1. **36D6 / AN/MPQ-64 風格高架三座標防空雷達**：具備北約三色林地迷彩電子方艙、四角橘黑斜紋液壓調平駐鋤（Outrigger Jacks）、雙側空調冷卻機組、高架交叉桁架鋼塔與環形維修走道、可見鏤空金屬網格之橢圓拋物面主反射天線（附 7 根背部金屬支撐肋與四腳波導饋源臂）、頂部沙漠黃複合材質 IFF 敵我識別相控陣列橫條天線，以及脈動紅光防撞警示燈。
    2. **加固防爆鋼筋混凝土與迷彩浪板彈藥掩體**：具備外傾式抗爆扶壁（Sloped Blast Buttresses）、黑黃斜紋防撞門柱、屋頂防爆排風球、掩體內琥珀色防爆照明燈、紅色消防砂桶，以及分類碼放於木製棧板上的 155mm 高爆榴彈木箱（附黃色軍規噴字與黑色鋼帶）、雙聯裝防空飛彈儲運發射筒與三色防溢堤燃油桶區（紅丹防鏽紅、軍規橄欖綠、黃色高揮發警示漆 + 橘色 `1.1` 爆炸物菱形標誌），擊毀後並具持續燃燒之殘骸烈焰與濃黑煙柱（[`attachFacilityWreckFire`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L7749)）。
---

### v3.96：自然景物 3D 立體化、清除怪異巨石與 GPU 樹木風力動態搖曳系統 (2026-11-12)
- **自然景物 3D 立體化、清除怪異巨石與 GPU 樹木風力動態搖曳系統**：
  - **樹木 3D 全方位立體化與高擬真紋理（[`createVolumetricCanopyGeometry`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5815)、[`createConiferFoliageGeometry`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5836)）**：
    1. **高山針葉松／冷杉（Conifers）**：徹底摒棄舊版兩片傾斜單薄平面，改採 **4 層漸進收攏的 8 邊形錐形立體樹裙（Tiered Conical Foliage Skirts）** 結合內部 45°/135° 雙向十字針葉陰影核心，由無人機從正上方俯瞰或任意航向環繞均呈現飽滿立體的寶塔形松樹樹形，並在樹幹底部加入擴張形抓地樹根（Root Flare）。
    2. **低地闊葉林與雜木林（Broadleaf Trees）**：採用 **3 向立體交叉直立葉板（0°/60°/120°）搭配雙層水平向陽冠頂蓋（Foliage Dome Discs）** 與不對稱次級樹冠側球（Lobes），解決由上方視角俯視時邊緣薄如紙片的破綻；重新手繪生成式葉片畫布（`leafCanvas`），呈現具葉脈光影、多層次葉色與細緻 Alpha 切口的茂密葉片群。
  - **清除怪異巨型圓石、合理化崩岩分布與灌木植被重構**：
    1. **徹底移除舊版 1,800 顆怪異綠色球體（`scrub`）**：舊版在每株灌木周圍額外生成 3 顆 `SphereGeometry` 圓球，導致滿山遍野散布數千顆如巨型饅頭般突兀發光的綠色球體，現已徹底清除乾淨。
    2. **真實地質崩岩與露頭岩壁（[`createWeatheredBoulderGeometry`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5865)）**：岩石不再均勻散布於平坦草地，而是依據地形高程與坡度梯度（$\partial h/\partial x, \partial h/\partial z$）嚴格限制於陡峭岩壁（`steepness > 0.30`）與主山脊岩脊（`y > 15`），數量收斂為約 50 處自然崩岩，改採 12 面體不規則風化刻面岩石幾何與底部水平埋入切面，呈現堅硬花崗岩/頁岩質感。
    3. **立體葉化矮灌木（[`createShrubFoliageGeometry`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5854)）**：將舊版單純綠色球體改為立體交叉葉片灌木叢，自然分布於林緣與山凹陰影處。
  - **GPU 頂點著色器全場景樹木風力動態搖曳物理（[`applyTreeWindShader`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5750)、[`updateTreeWind`](file:///g:/其他電腦/Mac mini/文件/My Briefcase/Coding/UAV Simulator - Gemini/app.js#L5788)）**：
    1. **高度相依非線性彎曲（Height-Dependent Stem Bending）**：利用 `InstancedMesh` 頂點著色器，在樹根處（$y \le 0$）位移精準歸零保證永不離地，隨高度以非線性次幂曲線（$h^{1.6 \sim 1.75}$）向下風向傾側，同時依據長度守恆自動微幅下沉修正。
    2. **低頻晃動與高頻枝葉陣風顫動（Dual-Frequency Wind & Gust Vibration）**：結合宏觀擺動頻率（$\approx 1.15\text{Hz}$）與微觀葉片顫動（$\approx 4.6\text{Hz}$），且實時同步 `customDepthMaterial`，使全山林在地面上投射之陰影與樹體同步搖曳！
    3. **即時響應六大天候風勢**：晴朗天候（$2.5\text{m/s}$）呈現悠閒生動的自然微風擺動；暴雨天候（$9\text{m/s}$）樹身明顯順風壓低；颱風天候（$14\sim 16\text{m/s}$）呈現劇烈搖晃與陣風狂暴撕扯，極大提升動態真實感。

---

## 7. AI 接續開發之核心規範與高危地雷 (Crucial Gotchas & Invariants)

接續開發的 AI 請務必嚴格遵守以下準則：

1. **嚴禁引入外部建置工具與模組加載器**：
   - 保持原生單一檔案運作，所有新增的 Three.js 邏輯應直接融入 `app.js`，不可改寫為 `import ... from ...` 或要求用戶執行 `npm install`。
2. **禁止破壞 Canvas 貼圖離線自我生成原則**：
   - 新增招牌、水滴、店家或建築標誌時，請繼續擴充 `drawTaiwanBrandSign`、`createRainDropTexture` 等 Canvas 2D 繪製函式，**嚴禁以 URL 外連外部圖片**（避免圖床失效或跨域 CORS 問題）。
3. **保持繁體中文在地用語 (Traditional Chinese)**：
   - 台灣在地特色（如：騎樓、公車站、便當店、捷運、女兒牆、平交道）不可替換為非台灣用語。
4. **小心空間旋轉運算中的 NaN**：
   - 計算任何具有旋轉角度的建築物或附著招牌時，務必確保旋轉角與位置皆為合法的數字型別（Number）。
5. **版本查詢字串同步機制**：
   - 當修改 `app.js` 或 `style.css` 核心邏輯時，應同步檢查 `index.html` 內之版號查詢字串，避免瀏覽器快取舊版本代碼。

---

### 結算視窗回歸驗證
- 已移除回合開始時設定的行內隱藏樣式，結算視窗統一由 `hidden` 類別控制。雙人模式的換手與最終結算仍待瀏覽器試跑。

---

## 8. 未來擴充路線圖與代碼插槽 (Roadmap & Extension Hooks)

接手開發之 AI 可沿用既有模組插槽實現下列後續功能：

1. **台灣觀光夜市模組 (`buildTaiwanNightMarket`)**：
   - 插槽位置：於 `buildCity()` 完成後呼叫。
   - 實作建議：在特定路段（如 C區公園旁）放置雙排小吃帆布棚（紅、藍、黃頂棚）、傳統高掛紅燈籠海、發光燈箱與發電機模型。
2. **行人與車流航網 (`updatePedestriansAndTraffic`)**：
   - 插槽位置：在 `animate()` 內呼叫。
   - 實作建議：利用既有的十字路口節點陣列，產生簡易低多邊形行人巡邏路線與機車穿梭街巷。
3. **多角度重播系統 (Cinematic Replay System)**：
   - 插槽位置：利用 `state.currentRecording`（目前已錄製 `x, y, z, yaw`）。
   - 實作建議：新增電視轉播固定機位（如樓頂攝影機、路口監視器視角），在訓練或比賽結束後播放穿梭特寫鏡頭。
4. **虛擬觸控搖桿支援 (Virtual Touch Joystick)**：
   - 插槽位置：在 `index.html` 增加觸控 Overlay，於 `app.js` 擴充 `touchstart` / `touchmove` 注入至 `sampleFlightControls()`。

---
*文件修訂日期　2026 年 11 月 12 日 下午*  
*架構維護：Antigravity Agentic Assistant (Google DeepMind Team)*
