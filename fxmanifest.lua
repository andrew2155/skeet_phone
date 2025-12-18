fx_version 'cerulean'
game 'gta5'
lua54 'yes'

author 'skeet'
description 'skeet_phone - modular iOS glass phone shell (home + settings)'

ui_page 'ui/index.html'

files {
  'ui/index.html',
  'ui/app.js',
  'ui/style.css',
  'ui/assets/*.*'
}

shared_scripts {
  'config.lua'
}

client_scripts {
  'client/main.lua'
}

server_scripts {
  '@oxmysql/lib/MySQL.lua',
  'server/main.lua'
}

dependency 'qb-core'
