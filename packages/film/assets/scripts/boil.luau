-- Ink boil: the authored outline redrawn a little differently twelve times a
-- second, like hand-inked frames. The clock is the `clock` input, which the
-- scene keys on its `main` timeline (seconds, linear), never elapsed time, so
-- a render that jumps to any frame draws the same shape there.
--
-- Use: copy to `<film>/rive/scripts/boil.luau`, declare it in `assets.rml`
-- (`<ScriptAsset file="scripts/boil.luau" name="boil" id="…"/>`), and put
-- `<ScriptedPathEffect scriptAssetId="…">` inside the shape's Fill or Stroke
-- (give the Stroke join="round") with
-- `<ScriptInputNumber name="clock" propertyValue="0" id="…"/>`; key that
-- input's `propertyValue` (key 243) on `main` from 0 at frame 0 to the scene's
-- length in seconds at its last frame, linear. `amp` (px, default 2.5) and
-- `fps` (default 12) are optional inputs.

type Boil = {
    clock: Input<number>,
    amp: Input<number>,
    fps: Input<number>,
}

-- Points per outline: at least MIN_POINTS, and one every MAX_STEP px on long ones.
local MIN_POINTS = 48
local MAX_STEP = 10

local function hash(i: number): number
    local x = math.sin(i * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)
end

-- A smooth wobble along the outline: value noise over the point index, so
-- neighbouring points move together and the line stays a line.
local function wobble(k: number, n: number, seed: number): number
    local cells = 6
    local u = k / n * cells
    local i = math.floor(u)
    local f = u - i
    local s = f * f * (3 - 2 * f)
    local a = hash((i % cells) + seed)
    local b = hash(((i + 1) % cells) + seed)
    return (a * (1 - s) + b * s - 0.5) * 2
end

local function update(self: Boil, path: PathData, node: NodeReadData): PathData
    local amp = self.amp
    if amp <= 0 then amp = 2.5 end
    local fps = self.fps
    if fps <= 0 then fps = 12 end
    local frame = math.floor(self.clock * fps + 1e-6)
    local out = Path.new()
    local contour = path:contours()
    local c = 0
    while contour do
        local len = contour.length
        local closed = contour.isClosed
        local n = math.max(MIN_POINTS, math.ceil(len / MAX_STEP))
        local last = n
        local prev = Vector.xy(0, 0)
        if closed then last = n - 1 end
        for k = 0, last do
            local pos, raw = contour:positionAndTangent(len * k / n)
                -- The tangent is not unit length at a curve's segment joins.
                local tan = Vector.normalized(raw)
            local w = wobble(k, n, c * 97 + frame * 13.7) * amp
            local p = Vector.xy(pos.x - tan.y * w, pos.y + tan.x * w)
            if k == 0 then
                out:moveTo(p)
                prev = p
            elseif Vector.distance(p, prev) > 0.75 then
                -- Where curve segments join, two samples can land on one spot;
                -- a hair-long backtrack there becomes a miter spike.
                out:lineTo(p)
                prev = p
            end
        end
        if closed then out:close() end
        c += 1
        contour = contour.next
    end
    return out
end

return function(): PathEffect<Boil>
    return { clock = 0, amp = 2.5, fps = 12, update = update }
end
