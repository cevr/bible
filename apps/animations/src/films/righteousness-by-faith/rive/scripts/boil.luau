-- Ink boil: the authored outline redrawn a little differently twelve times a
-- second, like hand-inked frames. The clock is the `clock` input, which the
-- scene keys on its `main` timeline (seconds, linear), never elapsed time, so
-- a render that jumps to any frame draws the same shape there.
--
-- Use: copy to `<film>/rive/scripts/boil.luau`, declare it in `assets.rml`
-- (`<ScriptAsset file="scripts/boil.luau" name="boil" id="…"/>`), and put
-- `<ScriptedPathEffect scriptAssetId="…">` inside the shape's Fill or Stroke
-- with `<ScriptInputNumber name="clock" propertyValue="0" id="…"/>`; key that
-- input's `propertyValue` (key 243) on `main` from 0 at frame 0 to the scene's
-- length in seconds at its last frame, linear. `amp` (px, default 2.5) and
-- `fps` (default 12) are optional inputs.

type Boil = {
    clock: Input<number>,
    amp: Input<number>,
    fps: Input<number>,
}

local STEP = 14

local function hash(i: number): number
    local x = math.sin(i * 127.1 + 311.7) * 43758.5453
    return x - math.floor(x)
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
        local n = math.max(4, math.floor(len / STEP))
        for k = 0, n - 1 do
            local d = len * k / n
            local wobble = (hash(k * 13 + c * 101 + frame * 7.31) - 0.5) * 2 * amp
            local p = contour:warp(Vector.xy(d, wobble))
            if k == 0 then out:moveTo(p) else out:lineTo(p) end
        end
        if contour.isClosed then out:close() end
        c += 1
        contour = contour.next
    end
    return out
end

return function(): PathEffect<Boil>
    return { clock = 0, amp = 2.5, fps = 12, update = update }
end
