package com.paulorchard.islandcraft.dunesofarrakis;

import com.hypixel.hytale.codec.lookup.Priority;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.universe.world.worldgen.provider.IWorldGenProvider;

import java.util.logging.Level;

public class DunesOfArrakisPlugin extends JavaPlugin {

    public DunesOfArrakisPlugin(JavaPluginInit init) {
        super(init);
    }

    @Override
    protected void setup() {
        // The world config falls back to the lowest-priority provider when it has no
        // WorldGen key. Vanilla's "Hytale" sits at DEFAULT.before(1), so go below it.
        IWorldGenProvider.CODEC.register(
                Priority.DEFAULT.before(10), DunesOfArrakisWorldGenProvider.ID,
                DunesOfArrakisWorldGenProvider.class, DunesOfArrakisWorldGenProvider.CODEC);

        getLogger().at(Level.INFO).log(
                "Registered '%s' as the default world generator for new worlds", DunesOfArrakisWorldGenProvider.ID);
    }
}
