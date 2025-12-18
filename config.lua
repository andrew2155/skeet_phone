Config = {}

-- ===== Core =====
Config.OpenKey = 'F3'          -- configurable keybind
Config.CloseKey = 'ESC'        -- UI handles ESC, but keep here for future

-- ===== Phone item gating =====
Config.RequirePhoneItem = false     -- turn on/off item requirement
Config.PhoneItemName = 'phone'     -- qb-inventory item name

-- ===== Layout =====
Config.GridCols = 4
Config.GridRows = 6
Config.DockSlots = 4

Config.HomeReturnAlwaysPage1 = true

-- ===== Swipe =====
Config.EnableSwipe = true
Config.SwipeThresholdPx = 70

-- ===== UI Scale =====
Config.MinUiScale = 0.80
Config.MaxUiScale = 1.20
Config.DefaultUiScale = 1.00

-- ===== Frame colors (8 options) =====
Config.FrameColors = {
  { id = 0, name = 'Black Titanium',    value = '#111318' },
  { id = 1, name = 'White Titanium',    value = '#D7D9DE' },
  { id = 2, name = 'Natural Titanium',  value = '#2A2D33' },
  { id = 3, name = 'Blue Titanium',     value = '#2E6BFF' },
  { id = 4, name = '(PRODUCT)RED',      value = '#FF3B30' },
  { id = 5, name = 'Alpine Green',      value = '#34C759' },
  { id = 6, name = 'Starlight',         value = '#D6B36A' },
  { id = 7, name = 'Deep Purple',       value = '#AF52DE' },
  { id = 8, name = 'Forest Green',      value = '#08A00F' }, -- removed alpha for consistency
}


-- ===== Wallpapers =====
Config.BuiltInWallpapers = { 'ios1', 'ios2', 'ios3', 'ios4', 'ios5', 'ios6' }

-- ===== Input blocking =====
Config.BlockControls = true
