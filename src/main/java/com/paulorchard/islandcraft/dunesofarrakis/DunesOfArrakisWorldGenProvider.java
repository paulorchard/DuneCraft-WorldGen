package com.paulorchard.islandcraft.dunesofarrakis;

import com.hypixel.hytale.builtin.hytalegenerator.plugin.HandleProvider;
import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.universe.world.worldgen.IWorldGen;
import com.hypixel.hytale.server.core.universe.world.worldgen.WorldGenLoadException;
import com.hypixel.hytale.server.core.universe.world.worldgen.provider.IWorldGenProvider;

import java.util.logging.Level;

/**
 * World gen provider that delegates to the built-in V2 generator ("HytaleGenerator")
 * with the Dunes_of_Arrakis world structure selected.
 */
public class DunesOfArrakisWorldGenProvider implements IWorldGenProvider {

    public static final String ID = "Dunes_of_Arrakis";
    public static final String DEFAULT_WORLD_STRUCTURE_NAME = "Dunes_of_Arrakis";

    private static final String DELEGATE_ID = "HytaleGenerator";
    private static final HytaleLogger LOGGER = HytaleLogger.forEnclosingClass();

    public static final BuilderCodec<DunesOfArrakisWorldGenProvider> CODEC =
            BuilderCodec.builder(DunesOfArrakisWorldGenProvider.class, DunesOfArrakisWorldGenProvider::new)
                    .documentation("Generates Arrakis terrain using the standard Hytale generator.")
                    .append(new KeyedCodec<>("WorldStructure", Codec.STRING, false),
                            (provider, name) -> provider.worldStructureName = name,
                            provider -> provider.worldStructureName)
                    .documentation("The world structure to be used for this world. Defaults to \""
                            + DEFAULT_WORLD_STRUCTURE_NAME + "\".")
                    .add()
                    .build();

    // Null means "use the default"; null fields are not encoded, so a new world's
    // config is saved as just { "Type": "Dunes_of_Arrakis" }.
    private String worldStructureName;

    public String getWorldStructureName() {
        return worldStructureName != null ? worldStructureName : DEFAULT_WORLD_STRUCTURE_NAME;
    }

    @Override
    public IWorldGen getGenerator() throws WorldGenLoadException {
        BuilderCodec<? extends IWorldGenProvider> delegateCodec = IWorldGenProvider.CODEC.getCodecFor(DELEGATE_ID);
        if (delegateCodec == null) {
            throw new WorldGenLoadException("Dunes of Arrakis world gen needs the '" + DELEGATE_ID
                    + "' world gen provider, but it is not registered. Is the Hytale:HytaleGenerator plugin enabled?");
        }

        // getDefaultValue() invokes the codec's supplier, so this instance is ours to configure.
        if (!(delegateCodec.getDefaultValue() instanceof HandleProvider delegate)) {
            throw new WorldGenLoadException("Dunes of Arrakis world gen expected the '" + DELEGATE_ID
                    + "' world gen provider to be a " + HandleProvider.class.getName() + ", but it is not.");
        }

        String structure = getWorldStructureName();
        delegate.setWorldStructureName(structure);

        LOGGER.at(Level.INFO).log("Creating Dunes of Arrakis world generator with world structure '%s'", structure);
        // Wrapped so the spawn point is found on exposed rock near the origin.
        return new DunesOfArrakisWorldGen(delegate.getGenerator());
    }
}
