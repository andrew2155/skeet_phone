local QBCore = exports['qb-core']:GetCoreObject()

-- Create table once (safe)
CreateThread(function()
  MySQL.query([[
    CREATE TABLE IF NOT EXISTS skeet_phone_profiles (
      citizenid VARCHAR(64) NOT NULL,
      frame_color TINYINT NOT NULL DEFAULT 0,
      wallpaper_type VARCHAR(16) NOT NULL DEFAULT 'builtin',
      wallpaper_value VARCHAR(255) NOT NULL DEFAULT 'ios1',
      ui_scale FLOAT NOT NULL DEFAULT 1.0,
      theme VARCHAR(8) NOT NULL DEFAULT 'dark',
      layout_json LONGTEXT NULL,
      dock_json TEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (citizenid)
    );
  ]])
end)

local function defaultLayout()
  return { pages = { { slots = {} } }, removedApps = {} }
end

local function defaultDock()
  return {} -- ordered list of appIds (or nulls handled client-side)
end

QBCore.Functions.CreateCallback('skeet_phone:server:canOpen', function(source, cb)
  if not Config.RequirePhoneItem then
    cb(true)
    return
  end

  local Player = QBCore.Functions.GetPlayer(source)
  if not Player then cb(false) return end

  local has = Player.Functions.GetItemByName(Config.PhoneItemName) ~= nil
  cb(has)
end)

QBCore.Functions.CreateCallback('skeet_phone:server:getProfile', function(source, cb)
  local Player = QBCore.Functions.GetPlayer(source)
  if not Player then cb(nil) return end

  local cid = Player.PlayerData.citizenid
  local row = MySQL.single.await('SELECT * FROM skeet_phone_profiles WHERE citizenid = ?', { cid })

  if not row then
    local layout = defaultLayout()
    local dock = defaultDock()

    MySQL.insert.await([[
      INSERT INTO skeet_phone_profiles
        (citizenid, frame_color, wallpaper_type, wallpaper_value, ui_scale, theme, layout_json, dock_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ]], {
      cid,
      0,
      'builtin',
      Config.BuiltInWallpapers[1] or 'ios1',
      Config.DefaultUiScale,
      'dark',
      json.encode(layout),
      json.encode(dock)
    })

    cb({
      citizenid = cid,
      frameColor = 0,
      wallpaper = { type = 'builtin', value = Config.BuiltInWallpapers[1] or 'ios1' },
      uiScale = Config.DefaultUiScale,
      theme = 'dark',
      layout = layout,
      dock = dock
    })
    return
  end

  local layout = row.layout_json and json.decode(row.layout_json) or defaultLayout()
  local dock = row.dock_json and json.decode(row.dock_json) or defaultDock()

  cb({
    citizenid = cid,
    frameColor = tonumber(row.frame_color) or 0,
    wallpaper = {
      type = row.wallpaper_type or 'builtin',
      value = row.wallpaper_value or (Config.BuiltInWallpapers[1] or 'ios1')
    },
    uiScale = tonumber(row.ui_scale) or Config.DefaultUiScale,
    theme = (row.theme == 'light') and 'light' or 'dark',
    layout = layout,
    dock = dock
  })
end)

RegisterNetEvent('skeet_phone:server:saveProfile', function(payload)
  local src = source
  local Player = QBCore.Functions.GetPlayer(src)
  if not Player then return end

  local cid = Player.PlayerData.citizenid
  if type(payload) ~= 'table' then return end

  local frameColor = tonumber(payload.frameColor) or 0
  local uiScale = tonumber(payload.uiScale) or Config.DefaultUiScale
  local theme = (payload.theme == 'light') and 'light' or 'dark'

  local wp = payload.wallpaper or { type = 'builtin', value = Config.BuiltInWallpapers[1] or 'ios1' }
  local wpType = (wp.type == 'url') and 'url' or 'builtin'
  local wpValue = tostring(wp.value or (Config.BuiltInWallpapers[1] or 'ios1'))

  local layoutJson = payload.layout and json.encode(payload.layout) or nil
  local dockJson = payload.dock and json.encode(payload.dock) or nil

  MySQL.update([[
    INSERT INTO skeet_phone_profiles (citizenid, frame_color, wallpaper_type, wallpaper_value, ui_scale, theme, layout_json, dock_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      frame_color = VALUES(frame_color),
      wallpaper_type = VALUES(wallpaper_type),
      wallpaper_value = VALUES(wallpaper_value),
      ui_scale = VALUES(ui_scale),
      theme = VALUES(theme),
      layout_json = VALUES(layout_json),
      dock_json = VALUES(dock_json)
  ]], { cid, frameColor, wpType, wpValue, uiScale, theme, layoutJson, dockJson })
end)
