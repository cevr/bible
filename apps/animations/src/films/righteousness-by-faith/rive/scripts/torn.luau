-- A torn paper edge: the authored outline, walked every `step` px and pushed
-- along its normal by seeded value noise. It reads only its input path, never
-- the clock, so a frame draws the same whatever was drawn before it.
--
-- Use: copy to `<film>/rive/scripts/torn.luau`, declare it once in
-- `assets.rml` (`<ScriptAsset file="scripts/torn.luau" name="torn" id="…"/>`),
-- and put `<ScriptedPathEffect scriptAssetId="…"/>` inside the shape's Fill
-- or Stroke (not directly on the Shape: that build fails to re-import).
-- Optional `<ScriptInputNumber>` children: `amp` (px of tear, default 7),
-- `step` (px between points, default 5) and `seed` (a different tear).

type Torn = {
    amp: Input<number>,
    step: Input<number>,
    seed: Input<number>,
}

local function hash(i: number): number
    local x = math.sin(i * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)
end

-- Value noise over `cells` cells that wrap, so a closed outline's tear meets
-- itself where it starts.
local function noise(d: number, cells: number, seed: number): number
    local i = math.floor(d)
    local f = d - i
    local u = f * f * (3 - 2 * f)
    return hash(i % cells + seed) * (1 - u) + hash((i + 1) % cells + seed) * u
end

local function update(self: Torn, path: PathData, node: NodeReadData): PathData
    local amp = self.amp
    if amp <= 0 then amp = 7 end
    local step = self.step
    if step <= 0 then step = 5 end
    local out = Path.new()
    local contour = path:contours()
    local seed = self.seed * 131
    while contour do
        local len = contour.length
        local closed = contour.isClosed
        local n = math.max(3, math.floor(len / step))
        local cells = math.max(2, math.floor(len / 18 + 0.5))
        local last = n
        if closed then last = n - 1 end
        for k = 0, last do
            local d = len * k / n
            local jitter = hash(k % n + seed) - 0.5
            if not closed and (k == 0 or k == n) then jitter = 0 end
            local tear = (noise(d / len * cells, cells, seed) - 0.5) * 2 * amp + jitter * amp * 0.4
            local pos, raw = contour:positionAndTangent(d)
            -- The tangent is not unit length at a curve's segment joins.
            local tan = Vector.normalized(raw)
            local p = Vector.xy(pos.x - tan.y * tear, pos.y + tan.x * tear)
            if k == 0 then out:moveTo(p) else out:lineTo(p) end
        end
        if closed then out:close() end
        seed += 97
        contour = contour.next
    end
    return out
end

return function(): PathEffect<Torn>
    return { amp = 7, step = 5, seed = 0, update = update }
end
