-- Paper grain: a field of faint light and dark flecks over a `width` x `height`
-- box from the drawable's origin, placed by a seeded hash. It draws once and
-- never reads the clock, so a frame draws the same whatever came before it.
--
-- Use: copy to `<film>/rive/scripts/grain.luau`, declare it in `assets.rml`
-- (`<ScriptAsset file="scripts/grain.luau" name="grain" id="…"/>`), and put
-- a `<ScriptedDrawable scriptAssetId="…">` last in the artboard (on top), with
-- `<ScriptInputNumber name="width" propertyValue="1920"/>`, `height`, and
-- optionally `amount` (flecks per 10,000 px², default 6) and `seed`.

type Grain = {
    width: Input<number>,
    height: Input<number>,
    amount: Input<number>,
    seed: Input<number>,
    dark: Path,
    light: Path,
    darkPaint: Paint,
    lightPaint: Paint,
}

local function hash(i: number): number
    local x = math.sin(i * 12.9898 + 78.233) * 43758.5453
    return x - math.floor(x)
end

local function fleck(path: Path, x: number, y: number, r: number)
    path:moveTo(Vector.xy(x - r, y))
    path:lineTo(Vector.xy(x, y - r))
    path:lineTo(Vector.xy(x + r, y))
    path:lineTo(Vector.xy(x, y + r))
    path:close()
end

local function update(self: Grain)
    self.dark:reset()
    self.light:reset()
    local w, h = self.width, self.height
    local per = self.amount
    if per <= 0 then per = 6 end
    local n = math.floor(w * h / 10000 * per)
    local s = self.seed * 7919
    for i = 1, n do
        local x = hash(i + s) * w
        local y = hash(i * 1.618 + s + 11) * h
        local r = 0.6 + hash(i * 2.414 + s + 23) * 1.4
        if hash(i * 3.3 + s + 37) < 0.55 then fleck(self.dark, x, y, r) else fleck(self.light, x, y, r) end
    end
end

local function draw(self: Grain, renderer: Renderer)
    renderer:drawPath(self.dark, self.darkPaint)
    renderer:drawPath(self.light, self.lightPaint)
end

return function(): Node<Grain>
    return {
        width = 1920,
        height = 1080,
        amount = 6,
        seed = 1,
        dark = Path.new(),
        light = Path.new(),
        darkPaint = Paint.with({ color = Color.rgba(60, 40, 20, 34) }),
        lightPaint = Paint.with({ color = Color.rgba(255, 250, 235, 40) }),
        update = update,
        draw = draw,
    }
end
