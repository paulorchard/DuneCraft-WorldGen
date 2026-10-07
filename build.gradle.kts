plugins {
    id("java")
}

group = "com.paulorchard"
version = "0.1.0"

val hytaleServerVersion = "0.6.8"
val modsDir = file("${System.getenv("APPDATA")}/Hytale/UserData/Mods")

repositories {
    mavenCentral()
    maven {
        name = "Hytale"
        url = uri("https://maven.hytale.com/release")
    }
}

dependencies {
    compileOnly("com.hypixel.hytale:Server:$hytaleServerVersion")
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of(25))
}

tasks.jar {
    archiveBaseName.set("Arrakis")
}

tasks.register<Copy>("deployMod") {
    group = "hytale"
    description = "Copies the built jar into the Hytale Mods folder, replacing any earlier Arrakis build."

    from(tasks.jar)
    into(modsDir)

    doFirst {
        delete(fileTree(modsDir) {
            include("Arrakis-*.zip", "Arrakis-*.jar")
        })
    }
}
