-- A torn paper edge: the authored outline, walked every `STEP` px and pushed
-- along its normal by seeded value noise. It reads only its input path, never
-- the clock, so a frame draws the same whatever was drawn before it.
--
-- Use: copy to `<film>/rive/scripts/torn.luau`, declare it once in
-- `assets.rml` (`<ScriptAsset file="scripts/torn.luau" name="torn" id="…"/>`),
-- and put `<ScriptedPathEffect scriptAssetId="…"/>` inside the shape's Fill
-- or Stroke (not directly on the Shape: that build fails to re-import).

type Torn = {}

local STEP = 5
local AMP = 7

local function hash(i: number): number
    local x = math.sin(i * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)
end

local function noise(d: number): number
    local i = math.floor(d)
    local f = d - i
    local u = f * f * (3 - 2 * f)
    return hash(i) * (1 - u) + hash(i + 1) * u
end

local function update(self: Torn, path: PathData, node: NodeReadData): PathData
    local out = Path.new()
    local contour = path:contours()
    local seed = 0
    while contour do
        local len = contour.length
        local n = math.max(3, math.floor(len / STEP))
        for k = 0, n - 1 do
            local d = len * k / n
            local tear = (noise(d / 18 + seed) - 0.5) * 2 * AMP + (hash(k + seed) - 0.5) * 3
            local p = contour:warp(Vector.xy(d, tear))
            if k == 0 then out:moveTo(p) else out:lineTo(p) end
        end
        out:close()
        seed += 97
        contour = contour.next
    end
    return out
end

return function(): PathEffect<Torn>
    return { update = update }
end
