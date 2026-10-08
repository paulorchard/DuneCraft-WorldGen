package com.paulorchard.islandcraft.dunesofarrakis;

import com.hypixel.hytale.math.vector.Transform;
import com.hypixel.hytale.server.core.universe.world.spawn.ISpawnProvider;
import com.hypixel.hytale.server.core.universe.world.worldgen.GeneratedChunk;
import com.hypixel.hytale.server.core.universe.world.worldgen.IWorldGen;
import com.hypixel.hytale.server.core.universe.world.worldgen.WorldGenTimingsCollector;
import it.unimi.dsi.fastutil.longs.Long2FloatFunction;

import java.util.concurrent.CompletableFuture;
import java.util.function.LongPredicate;

/**
 * The built-in generator with one change: the default spawn provider looks for
 * exposed rock near the origin instead of using the world structure's fixed point.
 */
public class DunesOfArrakisWorldGen implements IWorldGen {

    private final IWorldGen delegate;

    public DunesOfArrakisWorldGen(IWorldGen delegate) {
        this.delegate = delegate;
    }

    @Override
    public WorldGenTimingsCollector getTimings() {
        return delegate.getTimings();
    }

    @Override
    public CompletableFuture<GeneratedChunk> generate(int seed, long index, int x, int z,
                                                      LongPredicate stillNeeded, Long2FloatFunction priority) {
        return delegate.generate(seed, index, x, z, stillNeeded, priority);
    }

    @Override
    public Transform[] getSpawnPoints(int seed) {
        return delegate.getSpawnPoints(seed);
    }

    @Override
    public ISpawnProvider getDefaultSpawnProvider(int seed) {
        return new DunesOfArrakisSpawnProvider();
    }

    @Override
    public void shutdown() {
        delegate.shutdown();
    }
}
