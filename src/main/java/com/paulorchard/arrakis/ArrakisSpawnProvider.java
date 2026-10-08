package com.paulorchard.arrakis;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.math.util.ChunkUtil;
import com.hypixel.hytale.math.vector.Transform;
import com.hypixel.hytale.server.core.asset.type.blocktype.config.BlockType;
import com.hypixel.hytale.server.core.universe.world.World;
import com.hypixel.hytale.server.core.universe.world.chunk.WorldChunk;
import com.hypixel.hytale.server.core.universe.world.spawn.ISpawnProvider;
import it.unimi.dsi.fastutil.longs.Long2ObjectOpenHashMap;
import org.joml.Vector3d;

import java.util.UUID;
import java.util.logging.Level;

/**
 * Spawns players on exposed rock near the origin.
 *
 * The first time a spawn point is asked for, columns are searched outwards from the
 * origin for a surface block that is rock rather than sand. The result is kept for
 * as long as the world stays loaded. If no rock is found the player is put on the
 * surface at the origin, whatever it is.
 */
public class ArrakisSpawnProvider implements ISpawnProvider {

    /** How far from the origin to look, in blocks. */
    static final int SEARCH_RADIUS = 320;
    /** Once any rock has been seen, how much further to look for a level spot before settling for it. */
    static final int LEVEL_SPOT_EXTRA = 24;
    private static final String ROCK_PREFIX = "Rock_";

    private static final HytaleLogger LOGGER = HytaleLogger.forEnclosingClass();

    private Transform found;

    @Override
    public synchronized Transform getSpawnPoint(World world, UUID uuid) {
        if (found == null) {
            found = search(world);
        }
        return new Transform(found);
    }

    @Override
    public synchronized Transform[] getSpawnPoints() {
        return new Transform[] {found != null ? new Transform(found) : new Transform(0.5, 0.0, 0.5)};
    }

    @Override
    public synchronized boolean isWithinSpawnDistance(Vector3d position, double distance) {
        Vector3d spawn = found != null ? found.getPosition() : new Vector3d(0.5, position.y(), 0.5);
        double dx = position.x() - spawn.x();
        double dz = position.z() - spawn.z();
        return dx * dx + dz * dz < distance * distance;
    }

    private Transform search(World world) {
        Long2ObjectOpenHashMap<WorldChunk> chunks = new Long2ObjectOpenHashMap<>();
        int anyX = 0;
        int anyZ = 0;
        int anyRing = -1;
        for (int ring = 0; ring <= SEARCH_RADIUS; ring++) {
            if (anyRing >= 0 && ring > anyRing + LEVEL_SPOT_EXTRA) {
                break;
            }
            // Columns at this ring distance from the origin, walked as the edge of a square.
            for (int i = -ring; i <= ring; i++) {
                for (int side = 0; side < 4; side++) {
                    if (ring == 0 && side > 0) {
                        break;
                    }
                    if (side >= 2 && (i == -ring || i == ring)) {
                        continue;
                    }
                    int x = side == 0 ? i : side == 1 ? i : side == 2 ? -ring : ring;
                    int z = side == 0 ? -ring : side == 1 ? ring : i;
                    int top = rockTop(world, chunks, x, z);
                    if (top < 0) {
                        continue;
                    }
                    if (anyRing < 0) {
                        anyRing = ring;
                        anyX = x;
                        anyZ = z;
                    }
                    if (isLevel(world, chunks, x, z, top)) {
                        return report(x, top, z, "level rock");
                    }
                }
            }
        }
        if (anyRing >= 0) {
            return report(anyX, rockTop(world, chunks, anyX, anyZ), anyZ, "rock, not level");
        }
        WorldChunk origin = chunk(world, chunks, 0, 0);
        int top = origin != null ? origin.getHeight(0, 0) : 0;
        LOGGER.at(Level.WARNING).log(
                "No exposed rock within %d blocks of the origin; spawning on the surface at the origin (Y %d)",
                SEARCH_RADIUS, top + 1);
        return new Transform(0.5, top + 1, 0.5);
    }

    private static Transform report(int x, int top, int z, String kind) {
        LOGGER.at(Level.INFO).log("Arrakis spawn set on %s at (%d, %d, %d)", kind, x, top + 1, z);
        return new Transform(x + 0.5, top + 1, z + 0.5);
    }

    /** The height of the top block of this column if it is rock, otherwise -1. */
    private static int rockTop(World world, Long2ObjectOpenHashMap<WorldChunk> chunks, int x, int z) {
        WorldChunk chunk = chunk(world, chunks, x, z);
        if (chunk == null) {
            return -1;
        }
        int top = chunk.getHeight(x, z);
        BlockType type = chunk.getBlockType(x, top, z);
        return type != null && type.getId() != null && type.getId().startsWith(ROCK_PREFIX) ? top : -1;
    }

    /** True when the four neighbouring columns are rock too, each within one block of this height. */
    private static boolean isLevel(World world, Long2ObjectOpenHashMap<WorldChunk> chunks, int x, int z, int top) {
        int[][] neighbours = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        for (int[] n : neighbours) {
            int other = rockTop(world, chunks, x + n[0], z + n[1]);
            if (other < 0 || Math.abs(other - top) > 1) {
                return false;
            }
        }
        return true;
    }

    private static WorldChunk chunk(World world, Long2ObjectOpenHashMap<WorldChunk> chunks, int x, int z) {
        long index = ChunkUtil.indexChunkFromBlock(x, z);
        WorldChunk chunk = chunks.get(index);
        if (chunk == null) {
            chunk = world.getNonTickingChunk(index);
            if (chunk != null) {
                chunks.put(index, chunk);
            }
        }
        return chunk;
    }
}
