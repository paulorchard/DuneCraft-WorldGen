import com.hypixel.hytale.assetstore.AssetRegistry;
import com.hypixel.hytale.assetstore.AssetStore;
import com.hypixel.hytale.builtin.hytalegenerator.assets.ThreadBridge;
import com.hypixel.hytale.builtin.hytalegenerator.assets.biomes.BiomeAsset;
import com.hypixel.hytale.builtin.hytalegenerator.assets.density.DensityAsset;
import com.hypixel.hytale.builtin.hytalegenerator.assets.worldstructures.WorldStructureAsset;
import com.hypixel.hytale.builtin.hytalegenerator.assets.framework.FrameworkAsset;
import com.hypixel.hytale.builtin.hytalegenerator.assets.terrains.TerrainAsset;
import com.hypixel.hytale.builtin.hytalegenerator.referencebundle.ReferenceBundle;
import com.hypixel.hytale.builtin.hytalegenerator.density.Density;
import com.hypixel.hytale.builtin.hytalegenerator.rng.SeedBox;
import com.hypixel.hytale.builtin.hytalegenerator.workerindexer.WorkerIndexer;
import com.hypixel.hytale.event.EventBus;
import com.hypixel.hytale.server.core.HytaleServer;
import com.hypixel.hytale.server.core.Options;
import org.joml.Vector3d;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.stream.Stream;

/**
 * Renders a top-down map of the Arrakis terrain using the game's own generator classes, for a given world seed.
 * The server jar must be on the classpath:
 *   java -cp HytaleServer.jar RealPreview.java <packRoot> <seed> <out.png> [centreX centreZ sizeMetres metresPerPixel]
 * packRoot is the folder containing Server/HytaleGenerator (src/main/resources).
 */
public class RealPreview {
    static PrintStream log;

    public static void main(String[] a) throws Exception {
        Path packRoot = Paths.get(a[0]);
        long seed = Long.parseLong(a[1]);
        String out = a[2];
        double cx = a.length > 3 ? Double.parseDouble(a[3]) : 0, cz = a.length > 4 ? Double.parseDouble(a[4]) : 0;
        double size = a.length > 5 ? Double.parseDouble(a[5]) : 2400, res = a.length > 6 ? Double.parseDouble(a[6]) : 3;
        // The server's logger takes over stdout/stderr, so write our own log file next to the image.
        log = new PrintStream(new FileOutputStream(out + ".log"), true);
        try {
            run(packRoot, seed, out, cx, cz, size, res);
        } catch (Throwable t) {
            t.printStackTrace(log);
            Runtime.getRuntime().halt(1);
        }
        Runtime.getRuntime().halt(0);
    }

    static void run(Path packRoot, long seed, String out, double cx, double cz, double size, double res) throws Exception {
        bootFakeServer();
        Class.forName("com.hypixel.hytale.builtin.hytalegenerator.assets.AssetManager");
        log.println("asset stores registered: " + AssetRegistry.getStoreMap().size());

        // Load every generator asset type that has files in the pack.
        Path genRoot = packRoot.resolve("Server");
        for (AssetStore<?, ?, ?> store : List.copyOf(AssetRegistry.getStoreMap().values())) {
            Path dir = genRoot.resolve(store.getPath());
            if (!Files.isDirectory(dir)) continue;
            List<Path> files;
            try (Stream<Path> s = Files.walk(dir)) { files = s.filter(p -> p.toString().endsWith(".json")).toList(); }
            if (files.isEmpty()) continue;
            var r = store.loadAssetsFromPaths("Arrakis", files);
            log.println("loaded " + store.getPath() + ": " + r.getLoadedAssets().keySet() + " failed=" + r.getFailedToLoadPaths());
        }

        WorldStructureAsset wsAsset = AssetRegistry.getAssetStore(WorldStructureAsset.class).getAssetMap().getAsset("Arrakis");
        if (wsAsset == null) throw new IllegalStateException("world structure Arrakis not loaded");
        // Same steps as BasicWorldStructureAsset.build and BiomeAsset.build, minus materials (block types are not loaded here).
        SeedBox seedBox = new SeedBox((int) seed);
        WorldStructureAsset.Argument arg = new WorldStructureAsset.Argument(null, seedBox, WorkerIndexer.Id.MAIN, new ThreadBridge());
        ReferenceBundle bundle = new ReferenceBundle();
        Field fw = wsAsset.getClass().getDeclaredField("frameworkAssets"); fw.setAccessible(true);
        for (FrameworkAsset fa : (FrameworkAsset[]) fw.get(wsAsset)) fa.build(arg, bundle);
        BiomeAsset biomeAsset = BiomeAsset.getAssetStore().getAssetMap().getAsset("Arrakis_Terrain");
        Field ta = BiomeAsset.class.getDeclaredField("terrainAsset"); ta.setAccessible(true);
        Density terrain = ((TerrainAsset) ta.get(biomeAsset)).buildDensity(arg.parentSeed, bundle, arg.workerId, arg.threadBridge);
        DensityAsset.Exported rockExport = DensityAsset.getExportedAsset("Arrakis_Rock");
        Density rock = rockExport == null ? null : rockExport.threadInstances.get(WorkerIndexer.Id.MAIN);
        log.println("biome built; rock export " + (rock != null ? "found" : "NOT found (rock will not be coloured)"));

        int w = (int) Math.round(size / res);
        float[] height = new float[w * w];
        boolean[] isRock = new boolean[w * w];
        Density.Context ctx = new Density.Context();
        ctx.position = new Vector3d();
        long t0 = System.nanoTime();
        for (int j = 0; j < w; j++) {
            for (int i = 0; i < w; i++) {
                double x = cx - size / 2 + i * res, z = cz - size / 2 + j * res;
                int top = 0;
                for (int y = 260; y > 0; y -= 4) { // coarse scan down, then refine
                    ctx.position.set(x, y, z);
                    if (terrain.process(ctx) > 0) {
                        top = y;
                        for (int yy = y + 3; yy > y; yy--) { ctx.position.set(x, yy, z); if (terrain.process(ctx) > 0) { top = yy; break; } }
                        break;
                    }
                }
                height[j * w + i] = top;
                if (rock != null) { ctx.position.set(x, top, z); isRock[j * w + i] = rock.process(ctx) > 0; }
            }
        }
        if (rock != null) { // underground check: rock area at two depths against rock showing at the surface
            long surface = 0, y40 = 0, y10 = 0;
            for (int j = 0; j < w; j++) for (int i = 0; i < w; i++) {
                double x = cx - size / 2 + i * res, z = cz - size / 2 + j * res;
                if (isRock[j * w + i]) surface++;
                ctx.position.set(x, 40, z); if (rock.process(ctx) > 0) y40++;
                ctx.position.set(x, 10, z); if (rock.process(ctx) > 0) y10++;
            }
            double ha = res * res / 10000.0;
            log.printf("rock showing above the sand %.1f ha; at Y=40 %.1f ha (%.2f x); at Y=10 %.1f ha (%.2f x)%n", surface * ha, y40 * ha, (double) y40 / Math.max(1, surface), y10 * ha, (double) y10 / Math.max(1, surface));
        }
        log.println("evaluated " + (w * w) + " columns in " + (System.nanoTime() - t0) / 1_000_000 + " ms");

        if (System.getenv("WALK") != null && res == 1.0) walkReport(height, isRock, w, cx, cz, size);

        BufferedImage img = new BufferedImage(w, w, BufferedImage.TYPE_INT_RGB);
        long rockPx = 0;
        for (int j = 0; j < w; j++) {
            for (int i = 0; i < w; i++) {
                float h = at(height, w, i, j);
                double dx = (at(height, w, i + 1, j) - at(height, w, i - 1, j)) / (2 * res), dz = (at(height, w, i, j + 1) - at(height, w, i, j - 1)) / (2 * res);
                boolean r = isRock[j * w + i];
                double k = r ? 0.9 : 0.35;
                double shade = Math.max(0.3, Math.min(1.25, (1 + k * dx + k * dz) / Math.sqrt(1 + dx * dx + dz * dz)));
                double[] col;
                if (r) { rockPx++; double t = Math.min(1, Math.max(0, (h - 80) / 120.0)); col = new double[]{150 + 60 * t, 95 + 55 * t, 60 + 45 * t}; }
                else col = new double[]{222, 190, 128};
                int rgb = 0;
                for (double c : col) rgb = (rgb << 8) | (int) Math.max(0, Math.min(255, c * shade));
                img.setRGB(i, j, rgb);
            }
        }
        ImageIO.write(img, "png", new File(out));
        log.printf("wrote %s: %dx%d px, %.1f m/px, rock %.1f%% of view%n", out, w, w, res, 100.0 * rockPx / (w * w));
    }

    /** Flood fill from the origin over 1 m columns, moving only where the height changes by at most 1 block. */
    static void walkReport(float[] height, boolean[] isRock, int w, double cx, double cz, double size) {
        int oi = (int) Math.round(-(cx - size / 2)), oj = (int) Math.round(-(cz - size / 2));
        if (oi < 0 || oj < 0 || oi >= w || oj >= w) { log.println("walk: origin not in view"); return; }
        boolean[] seen = new boolean[w * w];
        java.util.ArrayDeque<int[]> q = new java.util.ArrayDeque<>();
        q.add(new int[]{oi, oj}); seen[oj * w + oi] = true;
        boolean[] sector = new boolean[8];
        int rockReached = 0, padCells = 0; float padMin = 1e9f, padMax = -1e9f, maxRock = 0; int maxAtI = 0, maxAtJ = 0;
        for (int j = 0; j < w; j++) for (int i = 0; i < w; i++) {
            double d = Math.hypot(i - oi, j - oj);
            if (d <= 15) { padCells++; padMin = Math.min(padMin, height[j * w + i]); padMax = Math.max(padMax, height[j * w + i]); }
            if (d <= 130 && isRock[j * w + i] && height[j * w + i] > maxRock) { maxRock = height[j * w + i]; maxAtI = i - oi; maxAtJ = j - oj; }
        }
        int[][] nb = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        while (!q.isEmpty()) {
            int[] p = q.poll(); int k = p[1] * w + p[0];
            if (isRock[k]) rockReached++;
            else if (Math.hypot(p[0] - oi, p[1] - oj) > 40) { // reached sand: note the compass sector, do not walk on across the sand
                double ang = Math.toDegrees(Math.atan2(p[0] - oi, -(p[1] - oj))); if (ang < 0) ang += 360;
                sector[(int) Math.floor(((ang + 22.5) % 360) / 45)] = true; continue;
            }
            for (int[] n : nb) { int ni = p[0] + n[0], nj = p[1] + n[1]; if (ni < 0 || nj < 0 || ni >= w || nj >= w) continue; int nk = nj * w + ni;
                if (!seen[nk] && Math.abs(height[nk] - height[k]) <= 1) { seen[nk] = true; q.add(new int[]{ni, nj}); } }
        }
        String[] names = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"}; StringBuilder sb = new StringBuilder();
        for (int s = 0; s < 8; s++) if (sector[s]) sb.append(names[s]).append(' ');
        log.printf("walk: pad (15 m) top block Y %.0f..%.0f; walkable rock from the pad %d m2; sand reached without a step over 1 block towards: %s%n", padMin, padMax, rockReached, sb.length() == 0 ? "NONE" : sb.toString().trim());
        log.printf("walk: highest rock within 130 m of spawn: top block Y %.0f, %d m east and %d m south of the origin%n", maxRock, maxAtI, maxAtJ);
    }

    static float at(float[] h, int w, int i, int j) { return h[Math.max(0, Math.min(w - 1, j)) * w + Math.max(0, Math.min(w - 1, i))]; }

    /** The asset stores expect a running server; give them parsed options and a server object with an event bus. */
    static void bootFakeServer() throws Exception {
        Field parser = Options.class.getDeclaredField("PARSER"); parser.setAccessible(true);
        Field optionSet = Options.class.getDeclaredField("optionSet"); optionSet.setAccessible(true);
        optionSet.set(null, ((joptsimple.OptionParser) parser.get(null)).parse(new String[0]));

        Field uf = sun.misc.Unsafe.class.getDeclaredField("theUnsafe"); uf.setAccessible(true);
        sun.misc.Unsafe unsafe = (sun.misc.Unsafe) uf.get(null);
        Object server = unsafe.allocateInstance(HytaleServer.class);
        Field bus = HytaleServer.class.getDeclaredField("eventBus");
        unsafe.putObject(server, unsafe.objectFieldOffset(bus), new EventBus(false));
        Field instance = HytaleServer.class.getDeclaredField("instance");
        unsafe.putObject(unsafe.staticFieldBase(instance), unsafe.staticFieldOffset(instance), server);
        log.println("fake server ready");
    }
}
