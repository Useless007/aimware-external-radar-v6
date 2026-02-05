-- [[ UDP Settings ]]
local serverIP = "127.0.0.1"
local serverPort = 10001
local serverAuthKey = "12345"
local previousTickSent = 0
local ticksBetweenLoop = 5 

local client = network.Socket("UDP")

-- [[ Helper Functions ]]
function encodeHeader(h, d) return "<" .. h .. "|" .. tostring(d) .. ">" end
function encodeKey(k, v) return "{" .. k .. ":" .. tostring(v) .. "}" end
function encodeList(arr) return table.concat(arr, ";") end

-- ปรับให้ต่อกันโดยไม่มีคอมมาคั่นตามโจทย์
function encodeKeys(obj)
    local t = {}
    for i = 1, #obj do 
        table.insert(t, encodeKey(obj[i][1], obj[i][2])) 
    end
    return table.concat(t, "") 
end

-- [[ Core Data Functions ]]

function collectRounds()
    local total_rounds = 0
    local teams = entities.FindByClass("CCSTeam")
    for i = 1, #teams do
        -- ดึงคะแนนจาก m_iScore ของแต่ละทีมมาบวกกัน
        local score = teams[i]:GetProp("m_iScore") or 0
        total_rounds = total_rounds + score
    end
    return encodeHeader("rounds", total_rounds)
end

function collectPlayers()
    local arr = {}
    local pawns = entities.FindByClass("C_CSPlayerPawn")
    
    for i = 1, #pawns do
        local p = pawns[i]
        if p and p:GetTeamNumber() > 1 and p:IsAlive() then
            local pos = p:GetAbsOrigin()
            local x, y, z = 0, 0, 0
            if pos then x, y, z = pos.x, pos.y, pos.z end

            local name = p:GetName() or "Unknown"
            local team = p:GetTeamNumber()
            local health = p:GetHealth() or 0
            
            -- Format: {name:val}{team:val}{health:val}{x:val}{y:val}{z:val}
            local data = encodeKeys({
                {"name", name:gsub(";", " "):gsub(",", " ")}, 
                {"team", team}, 
                {"health", health},
                {"x", string.format("%.1f", x)}, 
                {"y", string.format("%.1f", y)}, 
                {"z", string.format("%.1f", z)}
            })
            table.insert(arr, data)
        end
    end
    return encodeHeader("players", encodeList(arr))
end

function collectC4()
    local x, y, z, t = 0, 0, 0, 0
    local planted = entities.FindByClass("C_PlantedC4")[1]
    local dropped = entities.FindByClass("C_CC4")[1]
    local target = planted or dropped

    if target then
        local pos = target:GetAbsOrigin()
        if pos then x, y, z = pos.x, pos.y, pos.z end

        if planted then
            pcall(function()
                local blowTime = planted:GetProp("m_flC4Blow") or 0
                local curtime = globals.CurTime()
                if blowTime > curtime then t = blowTime - curtime end
            end)
        end
    end

    -- Format: {x:val}{y:val}{z:val}{time:val}
    return encodeHeader("bomb", encodeKeys({
        {"x", string.format("%.1f", x)}, 
        {"y", string.format("%.1f", y)}, 
        {"z", string.format("%.1f", z)}, 
        {"time", string.format("%.1f", t)}
    }))
end

-- [[ Main Logic ]]

callbacks.Register("Draw", function()
    if (globals.TickCount() - previousTickSent > ticksBetweenLoop) then
        previousTickSent = globals.TickCount()
        
        -- ดึงชื่อแมพ
        local raw_map = engine.GetMapName() or "unknown"
        local map_name = raw_map:match(".*/(.*)%.") or raw_map
        
        -- รวบรวมข้อมูลทั้งหมดเข้าด้วยกัน (แก้ไข Syntax error ตรงนี้แล้ว)
        local auth_header = encodeHeader("auth", serverAuthKey)
        local map_header = encodeHeader("map", map_name)
        local rounds_header = collectRounds()
        local players_header = collectPlayers()
        local bomb_header = collectC4()

        local payload = auth_header .. map_header .. rounds_header .. players_header .. bomb_header

        -- แสดงผลใน Console
        --print("--- [RADAR DATA] ---")
        --print(payload)
        --print("--------------------")
        
        -- ส่ง UDP (เอา comment ออกถ้าพร้อมส่ง)
        client:SendTo(serverIP, serverPort, payload)
    end
end)