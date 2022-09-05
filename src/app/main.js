// // @ts-check
import {
    /* system */ init, Sprite, GameLoop, Pool,
    /* mouse  */ initPointer, track, getPointer, pointerPressed,
    /* maths  */ angleToTarget, clamp, movePoint, lerp
    /* Vector is imported through Sprite, GameObject, Updatable */
} from 'kontra';
import { colors } from './colors';

import { loadImages } from './images';
import { ArcadeAudio } from './audio';


async function start() {
    /**
     * behaviours:
     * w=walk(strafe, speed, targetX, targetY), // infinite aggro range
     * <=chase,  // chase at speed of 1
     * >=avoid,  // avoid at speed of 1
     * .=wander, // wander at speed of 0.2
     * d=solid,  // try not to collide with others
     * D=static, // stops others from hitting
     * W=wall,   // static, plus absorbs bullets
     * m=melee,  // does knockback on both sides
     * s=shooty(spellCard),
     * // b=box()     // gives item
     */

    const DIFFICULTY_RATIO = 1.2; // GoldenRatio=1.618

    const BACKGROUND_COLOR = colors.bgGray;// colors.bgBrown;
    const PHYSICAL_DIMENSION = 0;
    const SPECTRAL_DIMENSION = 1;
    const BETWEEN_DIMENSION1 = 2;
    const BETWEEN_DIMENSION2 = 3;
    const BETWEEN_DIMENSION3 = 4;


    const MAIN_NONE = 0 // none
    const MAIN_DUAL_PISTOL = 1 // dual pistol (low spray)
    const MAIN_MACHINE_GUN = 2 // machine gun (mid spray)
    const MAIN_SHOTGUN = 3 // shotgun (max spray)
    const MAIN_DUAL_UZI = 4 // dual uzi (no spray)
    const MAIN_MINI_GUN = 5 // mini gun (mid spray)
    const MAIN_SPREAD_GUN = 6 // spread gun (max spray)
    const MAIN_ROCKET = 7 // rocket (no spray)
    const MAIN_NUKE = 8 // nuke (no spray)


    const SUB_SPIRIT_DASH = 0 // Spirit Dash
    const SUB_SPIRIT_REVOLVER = 1 // Spectral Revolver


    const TEAM_PLAYER = 0;
    const TEAM_ENEMY = 1; // or undefined


    const ENEMY_RESPAWN_TIME = 25;

    const DIMENSION_TRANSITION_LENGTH1 = 500;
    const DIMENSION_TRANSITION_LENGTH2 = 1000;
    const DIMENSION_TRANSITION_LENGTH3 = 1000;

    const fixedDeltaTime = (1000 / 60) | 0;
    let fixedGameTime = 0;
    let gameIsOver = 0;
    let gameIsPaused = 0;

    let currentDimension = 0; // 0=physical, 1=spectral
    let dimensionTransitionUntil = 0;
    let dimensionAlpha = 0; // 0=physical, 1=spectral

    let score = 0;
    let scoreMultiplier = 10;
    let scoreMultiplierAck = 1;

    let energy = 0;
    let respawnEnergyCost = 5;
    let respawnEnergyTimeLimit = 0;
    let levelUpEnergyGoal = 10;

    let nextSpawnTick = -1;
    let enemyCount = 0;

    let mainWeapon = MAIN_NONE; // MAIN_NONE;
    let mainWeaponLv = 1; // 1,2,3;
    let gunSide = 1; // 0, 1
    let tutProgress = 0;



    // stats:
    let time = 0;
    // let score = score;
    // let wave index = waveId;
    let killsA = 0;
    let killsB = 0;
    let countCompleteKills = 0;
    let timeSpentInSpectralWorld = 0;



    // loading
    const images = await loadImages();
    const mainWeaponNames = [
        '', // 'None',
        'Dual pistols',
        'Submachine gun',
        'Shotgun',
    ]
    const mainWeaponImages = [
        '',
        images.dualPistolOrange,
        images.machineGunOrange,
        images.shotgunOrange,
    ];
    // const subWeaponImages = [
    //     '',
    //     // images.spiritRevolverBlue,
    // ];

    const audio = new ArcadeAudio();
    audio.volume = 0; // TODO: make mute button


    const _focus = () => focus();
    const canvas2 = document.querySelector('#b');
    const context2 = canvas2.getContext('2d');
    // init
    let { canvas, context } = init('a');
    canvas.addEventListener('pointerenter', _focus);
    context.imageSmoothingEnabled = false;
    context2.imageSmoothingEnabled = false;
    initPointer();


    const waves = [
        // [waveTime (sec), spawnInterval (ms), maxEnemyCount, spawnCount, ...list],
        [10 /*15*/, 2000, 5, 3, spawnBasicEnemy],
        [2 /*15*/, 2000, 10, 3],
        [30, 3000, 30, 3, spawnBasicEnemy, spawnBasicEnemy, spawnShooterEnemy],
        [20, 3000, 40, 3, spawnBasicEnemy, spawnShooterEnemy],
        [20, 3000, 50, 3, spawnBasicEnemy, spawnShooterEnemy],
        [30, 3000, 30, 5, spawnBasicEnemy, spawnShooterEnemy, spawnShooterEnemy, spawnFatEnemy],
        [30, 2000, 100, 3, spawnBasicEnemy, spawnShooterEnemy, spawnShooterEnemy, spawnShooterEnemy, spawnFatEnemy, spawnFatEnemy],
    ];

    let waveID = 0;
    let nextWaveTime = 0;
    let gameStart = Infinity;

    let blocks = [];
    let entities = [];
    let effectsPool = Pool({
        // create a new sprite every time the pool needs a new object
        //@ts-ignore
        create: Sprite
    });
    let playerBulletPool = Pool({
        // create a new sprite every time the pool needs a new object
        //@ts-ignore
        create: Sprite
    });
    let enemyBulletPool = Pool({
        // create a new sprite every time the pool needs a new object
        //@ts-ignore
        create: Sprite
    });

    let player = Sprite({
        /* #IfDev */
        name: 'player',
        /* #EndIfDev */
        x: canvas.width / 2,        // starting x,y position of the sprite
        y: canvas.height / 2 + 50,
        // color: 'red',  // fill color of the sprite rectangle
        // width: 20,     // width and height of the sprite rectangle
        // height: 40,
        // dx: 2,
        // dy: 2,
        image: images.playerPhysical,
        anchor: { x: 0.5, y: 0.5 },

        // custom properties
        team: TEAM_PLAYER, // 0=player, 1=enemy
        images: [images.playerPhysical, images.playerSpectral],
        speed: 1.5,
        nextCanShoot: fixedGameTime,
        dimension: PHYSICAL_DIMENSION, // 0=physical, 1=spectral
        frontRotation: 0,
    });
    entities.push(player);

    function lerpRadians(a, b, lerpFactor)// Lerps from angle a to b (both between 0.f and 2*Math.PI), taking the shortest path
    {
        let result;
        let diff = b - a;
        if (diff < -Math.PI) {
            // lerp upwards past 2*Math.PI
            b += 2 * Math.PI;
            result = lerp(a, b, lerpFactor);
            if (result >= 2 * Math.PI) {
                result -= 2 * Math.PI;
            }
        }
        else if (diff > Math.PI) {
            // lerp downwards past 0
            b -= 2 * Math.PI;
            result = lerp(a, b, lerpFactor);
            if (result < 0) {
                result += 2 * Math.PI;
            }
        }
        else {
            // straight lerp
            result = lerp(a, b, lerpFactor);
        }

        return result;
    }
    function randomUnitVector() {
        const rotation = Math.random() * 2 * Math.PI;
        return {
            x: Math.cos(rotation),
            y: Math.sin(rotation),
        }
    }
    // function dist(a, b) { // not using it saves more space ?!
    //     return Math.hypot(a.x - b.x, a.y - b.y);
    // }
    function spawnBasicEnemy() {
        // console.log('spawnBasicEnemy', this.x, this.y);
        const entity = Sprite({
            /* #IfDev */
            name: 'BasicEnemy',
            /* #EndIfDev */
            x: this.x,
            y: this.y,
            image: images.basicEnemyPhysical,
            anchor: { x: 0.5, y: 0.5 },

            // custom properties
            hp: 5,
            images: [images.basicEnemyPhysical, images.basicEnemySpectral],
            dimension: PHYSICAL_DIMENSION,
            b: 'dw<.',
            strafe: 0,
            onDeathSpawn() { spawnGhostFire.call(this, randomUnitVector(), spawnBasicEnemy); },
            targetX: this.x,
            targetY: this.y,
            speed: 1,
            aiNextTick: fixedGameTime,
            hitEffectUntil: fixedGameTime,
            team: TEAM_ENEMY,
            render() {
                context.globalAlpha = this.hitEffectUntil > fixedGameTime ? 0.5 : 1;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    context.drawImage(
                        this.image,
                        0,
                        0,
                        this.image.width,
                        this.image.height
                    );
                }
                // @endif

                // if (this.color) {
                //     context.fillStyle = this.color;
                //     //@ts-ignore
                //     context.fillRect(0, 0, this.width, this.height);
                // }
                context.globalAlpha = 1;
            },
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnFatEnemy() {
        // console.log('spawnBasicEnemy', this.x, this.y);
        const entity = Sprite({
            /* #IfDev */
            name: 'FatEnemy',
            /* #EndIfDev */
            x: this.x,
            y: this.y,
            image: images.basicEnemyPhysical,
            anchor: { x: 0.5, y: 0.5 },

            // custom properties
            hp: 15,
            size: 32,
            images: [images.basicEnemyPhysical, images.basicEnemySpectral],
            dimension: PHYSICAL_DIMENSION,
            b: 'dw<.',
            strafe: 0,
            onDeathSpawn() { spawnGhostFire.call(this, randomUnitVector(), spawnBasicEnemy); },
            targetX: this.x,
            targetY: this.y,
            speed: 0.65,
            aiNextTick: fixedGameTime,
            hitEffectUntil: fixedGameTime,
            team: TEAM_ENEMY,
            render() {
                context.globalAlpha = this.hitEffectUntil > fixedGameTime ? 0.5 : 1;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    context.drawImage(
                        this.image,
                        (this.image.width - this.size) / 2,
                        (this.image.width - this.size) / 2,
                        this.size,
                        this.size
                    );
                }
                // @endif

                // if (this.color) {
                //     context.fillStyle = this.color;
                //     //@ts-ignore
                //     context.fillRect(0, 0, this.width, this.height);
                // }
                context.globalAlpha = 1;
            },
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnShooterEnemy() {
        // console.log('spawnShooterEnemy', this.x, this.y);
        const entity = Sprite({
            /* #IfDev */
            name: 'ShooterEnemy',
            /* #EndIfDev */
            x: this.x,
            y: this.y,
            image: images.shooterEnemyPhysical,
            anchor: { x: 0.5, y: 0.5 },

            // custom properties
            hp: 3,
            team: TEAM_ENEMY,
            images: [images.shooterEnemyPhysical, images.shooterEnemySpectral],
            dimension: PHYSICAL_DIMENSION,
            b: 'dw<.s',
            strafe: 150,
            onDeathSpawn() { spawnGhostFire.call(this, randomUnitVector(), spawnShooterEnemy); },
            targetX: this.x,
            targetY: this.y,
            speed: 1,
            aiNextTick: fixedGameTime,
            hitEffectUntil: fixedGameTime,
            team: TEAM_ENEMY,
            nextCanShoot: fixedGameTime + 1500,
            render() {
                context.globalAlpha = this.hitEffectUntil > fixedGameTime ? 0.5 : 1;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    context.drawImage(
                        this.image,
                        0,
                        0,
                        this.image.width,
                        this.image.height
                    );
                }
                // @endif

                // if (this.color) {
                //     context.fillStyle = this.color;
                //     //@ts-ignore
                //     context.fillRect(0, 0, this.width, this.height);
                // }
                context.globalAlpha = 1;
            },
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
    };
    function spawnGhostFire(knockbackDir, spawnEntity) {
        /* #IfDev */
        // console.log('spawnGhostFire', this.x, this.y, knockbackDir.x, knockbackDir.y);
        /* #EndIfDev */
        const entity = Sprite({
            /* #IfDev */
            name: 'GhostFire',
            /* #EndIfDev */
            x: this.x,
            y: this.y,
            image: images.ghostFirePhysical,
            anchor: { x: 0.5, y: 0.5 },

            render() {
                const yy = Math.sin(fixedGameTime % 500 / 500 * 2 * Math.PI) * 1;
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    if (currentDimension == PHYSICAL_DIMENSION && this.returnHp - this.hp > 180) {
                        context.globalAlpha = 0.3 + 0.7 * (this.hp / this.returnHp);
                    }
                    context.drawImage(
                        this.image,
                        0,
                        yy,
                        this.image.width,
                        this.image.height
                    );
                    context.globalAlpha = 1;
                }
                // @endif

                if (this.color) {
                    context.fillStyle = this.color;
                    //@ts-ignore
                    context.fillRect(0, 0, this.width, this.height);
                }
            },

            // custom properties
            team: TEAM_ENEMY,
            images: [images.ghostFirePhysical, images.ghostFireSpectral],
            dimension: 1,
            hp: 1,
            b: 'w>.',
            knockDx: knockbackDir?.x * 3,
            knockDy: knockbackDir?.y * 3,
            speed: 0.2,
            targetX: this.x,
            targetY: this.y,
            aiNextTick: fixedGameTime + 1000,
            returnHp: 60 * ENEMY_RESPAWN_TIME,
            spawnEntity,
        });
        // entity.x = this.x - entity.width / 2;
        // entity.y = this.y - entity.height / 2;
        entities.push(entity);
        return entity;
    }

    function spawnSpriteEffect(type, position, direction, distance, image, ttl) {
        /**
         * types:
         * 1 = after-images effect: fly in direction + fade out
         * 2 = enemy respawn effect: fly in direction + fade in
         */
        /* #IfDev */
        // console.log('spawnEffect', type, position, rotation, speed, image, ttl);
        /* #EndIfDev */
        const effect = effectsPool.get({
            /* #IfDev */
            name: 'Effect',
            /* #EndIfDev */
            // x: position.x ,
            // y: position.y ,
            x: position.x + (type != 2 ? 0 : Math.cos(direction) * distance),
            y: position.y + (type != 2 ? 0 : Math.sin(direction) * distance),
            // dx: Math.cos(direction) * (distance / ttl),
            // dy: Math.sin(direction) * (distance / ttl),
            dx: Math.cos(direction) * (distance / ttl) * (type != 2 ? 1 : -1),
            dy: Math.sin(direction) * (distance / ttl) * (type != 2 ? 1 : -1),
            image,
            anchor: { x: 0.5, y: 0.5 },
            ttl,
            ttl2: ttl,

            render() {
                // @ifdef SPRITE_IMAGE
                if (this.image) {
                    // type 1
                    context.globalAlpha = (this.ttl / this.ttl2) * 0.7;
                    context.drawImage(
                        this.image,
                        0,
                        0,
                        this.image.width,
                        this.image.height
                    );
                    context.globalAlpha = 1;
                }
                // @endif

                if (this.color) {
                    context.fillStyle = this.color;
                    //@ts-ignore
                    context.fillRect(0, 0, this.width, this.height);
                }
            },
        });
        // return effect;
    }

    function spawnGraphicsEffect(type, position, direction, distance, color, text, ttl) {
        /**
         * types:
         * 1 = circle ripple effect: enlarge + fade out
         * 2 = circle collect effect: shrink + no fade
         * 3 = text effect: go up and fade out
         */
        /* #IfDev */
        // console.log('spawnGraphicsEffect', type, position, direction, distance, color, text, ttl);
        /* #EndIfDev */
        const effect = effectsPool.get({
            /* #IfDev */
            name: 'Effect',
            /* #EndIfDev */
            x: position.x,
            y: position.y,
            dx: type < 3 ? 0 : (Math.cos(direction) * distance / ttl),
            dy: type < 3 ? 0 : (Math.sin(direction) * distance / ttl),
            anchor: { x: 0, y: 0 },
            ttl,
            ttl2: ttl,

            render() {
                if (type < 3) {
                    context.strokeStyle = color;
                    context.lineWidth = 1;

                    context.globalAlpha = 1;
                    if (type == 1) context.globalAlpha = this.ttl / this.ttl2;

                    context.beginPath();
                    if (type == 1) context.arc(0, 0, ((1 - this.ttl / this.ttl2) * distance), 0, 2 * Math.PI);
                    if (type == 2) context.arc(0, 0, (this.ttl / this.ttl2 * distance), 0, 2 * Math.PI);
                    context.stroke();
                } else {
                    context2.font = '16px sans-serif';
                    context2.fillStyle = color;
                    context2.textAlign = 'center';
                    context2.fillText(text, this.x * 2, this.y * 2);
                }
                // if (this.color) {
                //     context.fillStyle = this.color;
                //     //@ts-ignore
                //     context.fillRect(0, 0, this.width, this.height);
                // }
            },
        });
        // return effect;
    }

    function spawnBox(x, y, _mainWeapon/*, _subWeapon*/) {

        spawnGraphicsEffect(2, { x, y }, 0, 500, colors.orange, 0, 60);
        const entity = Sprite({
            x, y,
            box: 1,
            mainWeapon: _mainWeapon,
            image: images.dualPistolOrange,
            update() {
                if (player.position.distance(this) < this.width / 2 + player.width / 2) {
                    // console.log('player collect box');

                    if (this.mainWeapon) { // not zero
                        if (mainWeapon == MAIN_NONE) {
                            nextWaveTime = fixedGameTime + waves[waveID][0] * 1000;
                            tutProgress = 1;
                        }
                        mainWeapon = this.mainWeapon;
                        nextSpawnTick = fixedGameTime + 500;
                        // console.log(mainWeapon);
                    }

                    audio.play('pickup');
                    energy = 0;
                    scoreMultiplierAck = scoreMultiplier / levelUpEnergyGoal | 0;
                    levelUpEnergyGoal = 5 + Math.pow(mainWeapon, 1.3) * 5 | 0;
                    console.log('levelUpEnergyGoal', levelUpEnergyGoal);
                    this.ttl = 0;

                    entities.filter(e => e.box == 1).forEach(e => e.ttl = 0);
                    spawnGraphicsEffect(3, this, -Math.PI / 2, 20, colors.white, mainWeaponNames[mainWeapon], 60);
                    spawnGraphicsEffect(1, this, 0, 500, colors.orange, 0, 60);

                    currentDimension = SPECTRAL_DIMENSION;
                    player.dimension = currentDimension;

                    respawnEnergyTimeLimit = fixedGameTime + 11 * 1000;

                    entities
                        .filter(entity => entity != player && player.position.distance(entity) < 100)
                        .forEach(entity => {
                            entity.knockDx = (entity.x - player.x) / player.position.distance(entity) * 12;
                            entity.knockDy = (entity.y - player.y) / player.position.distance(entity) * 12;
                        });
                }
            },
            render() {
                // draw box
                const _x = - this.image.width / 2;
                const _y = - this.image.height / 2;

                context.globalAlpha = 1;
                context.strokeStyle = colors.darkOrange;
                context.beginPath();
                context.ellipse(0, 0, 6, 12, (fixedGameTime % 2000) / 2000 * 2 * Math.PI, 0, 2 * Math.PI);
                context.stroke();
                context.strokeStyle = colors.blue;
                context.beginPath();
                context.ellipse(0, 0, 6, 10, -(fixedGameTime % 3000) / 3000 * 2 * Math.PI, 0, 2 * Math.PI);
                context.stroke();

                if (this.mainWeapon) { // not zero
                    context.drawImage(
                        mainWeaponImages[this.mainWeapon],
                        _x,
                        _y,
                        mainWeaponImages[this.mainWeapon].width,
                        mainWeaponImages[this.mainWeapon].height
                    );
                }
            },
        });
        entities.push(entity);
    }

    function getFreeSpace() {
        for (let trial = 0; trial < 100; trial++) {
            const pos = {
                x: Math.random() * (canvas.width - 100) + 50,
                y: Math.random() * (canvas.height - 100) + 50,
            };
            const spawnWidth = 64;

            if (!entities.some(entity => entity.position.distance(pos) < (entity.size ?? entity.width) / 2 + spawnWidth / 2)) {
                return pos
            }
        }
    }

    function HandleSpawnTick() {
        // spawner
        if (nextSpawnTick == -1 || nextSpawnTick > fixedGameTime) return;

        const [
            waveTime,
            spawnInterval,
            maxEnemyCount,
            spawnCount,
            ...list
        ] = waves[waveID] ?? waves[waves.length - 1];


        // console.log('HandleSpawnTick', {
        //     waveTime,
        //     spawnInterval,
        //     maxEnemyCount,
        //     spawnCount,
        //     list: list.length,
        // });
        for (let i = 0; list.length > 0 && i < (enemyCount > maxEnemyCount ? 1 : spawnCount); i++) {
            const freeSpace = getFreeSpace();
            if (!freeSpace) continue;
            spawnGhostFire.call(freeSpace, { x: 0, y: 0 }, list[(Math.random() * list.length) | 0]).hp = 50 * ENEMY_RESPAWN_TIME;
            enemyCount++;
        }
        if (fixedGameTime >= nextWaveTime) {
            waveID++;
            console.log('Wave up!', waveID);
            nextWaveTime = fixedGameTime + (waves[waveID] ?? waves[--waveID])[0] * 1000;
        }

        nextSpawnTick = fixedGameTime + spawnInterval + Math.random() * 2000;
    }
    function bulletUpdate(dt) {
        this.advance(dt);
        const entity = entities
            .filter(entity => entity.hp && entity.team !== this.team && entity.dimension === this.dimension)
            .find(entity => entity.position.distance(this) < (entity.size ?? entity.width) / 2 + this.width / 2)
            ;
        if (entity) {
            /* #IfDev */
            // console.log('collision');
            /* #EndIfDev */

            // damage enemy
            entity.hp -= 1;
            entity.hitEffectUntil = fixedGameTime + 60;
            if (entity.hp <= 0) {
                const addScore = 10 * (scoreMultiplier / levelUpEnergyGoal | 0);
                score += addScore;
                entity.ttl = 0;
                energy++;
                scoreMultiplier++;
                entity.onDeathSpawn?.();

                audio.play('explosion');
                let rotation = Math.random() * Math.PI;
                rotation += Math.PI / 2;
                spawnSpriteEffect(1, entity.position, rotation, 60, entity.image, 10);
                rotation += Math.PI / 2;
                spawnSpriteEffect(1, entity.position, rotation, 60, entity.image, 10);
                rotation += Math.PI / 2;
                spawnSpriteEffect(1, entity.position, rotation, 60, entity.image, 10);
                rotation += Math.PI / 2;
                spawnSpriteEffect(1, entity.position, rotation, 60, entity.image, 10);


                spawnGraphicsEffect(3, entity, -Math.PI / 2, 20, colors.white, '+' + addScore, 60);
            }
            // destroy bullet
            audio.play('hit');
            this.ttl = 0;

        }
        if (currentDimension == PHYSICAL_DIMENSION && player.position.distance(this) < player.width / 2 + this.width / 2) {
            enemyBulletPool.getAliveObjects().forEach(b => b.ttl = 0);
            // kill player into spectral dimension

            currentDimension = BETWEEN_DIMENSION1;
            player.dimension = currentDimension;

            dimensionAlpha = 0;
            dimensionTransitionUntil = fixedGameTime + DIMENSION_TRANSITION_LENGTH1;
            // console.log('currentDimension', currentDimension);

            player.dx = 0;
            player.dy = 0;
            energy = 0;
            scoreMultiplier = levelUpEnergyGoal;
            scoreMultiplierAck = 1;
            respawnEnergyTimeLimit = fixedGameTime + 14 * 1000;
            entities.filter(e => e.box == 1).forEach(e => e.ttl = 0);

            audio.play('death');
        }
    }

    // spawnBox(canvas.width / 2, canvas.height / 2, MAIN_SHOTGUN); // testing
    spawnBox(canvas.width / 2, canvas.height / 2, MAIN_DUAL_PISTOL);

    // Inputs (see https://xem.github.io/articles/jsgamesinputs.html)
    const input = {
        u: 0,
        d: 0,
        l: 0,
        r: 0,
        a: 0, /* attack */
        c1: 0, /* cheats */
        c2: 0, /* cheats */
    };

    const keyHandler = (e) => {
        const w = e.keyCode, t = e.type;

        // console.log("keyHandler", w, t);

        // -4 bytes zipped compared to if-statements
        // ['WASD', 'ZQSD', '↑←↓→']
        const keyMap = {
            87: 'u', /* W */
            90: 'u', /* Z */
            38: 'u', /* ↑ */
            83: 'd', /* S */
            40: 'd', /* ↓ */
            65: 'l', /* A */
            81: 'l', /* Q */
            37: 'l', /* ← */
            68: 'r', /* D */
            39: 'r', /* → */
            74: 'a', /* J */
            75: 'a', /* K */
            48: 'c1', /* 0 */ // cheat 1
            32: 's', /* space */
            8: 'b', /* backspace */
            13: 'en', /* enter */
            9: 'tb', /* tab */
        };

        if (!keyMap[w]) return;

        input[keyMap[w]] = +(t[3] < 'u');

        // toggles quick hack
        if (input.c1 && 'c1' == keyMap[w]) {
            input.c1 = 0;
        }
        if (input.s && 's' == keyMap[w]) {
            audio.play('test');
            input.s = 0;
        }
        if (input.en && 'en' == keyMap[w] && gameIsOver) {
            restart();
            input.en = 0;
        }
        if (input.tb && 'tb' == keyMap[w] && !gameIsOver) {
            gameIsPaused = !gameIsPaused;
            input.tb = 0;
        }
        // END toggles quick hack

        e.preventDefault();
        e.stopPropagation();
    };
    window.addEventListener('keydown', keyHandler);
    window.addEventListener('keyup', keyHandler);

    let loop = GameLoop({  // create the main game loop
        update() { // update the game state
            if (gameIsOver) return;
            if (gameIsPaused) return;
            fixedGameTime += fixedDeltaTime;
            console.log('fixedGameTime', fixedGameTime);
            [
                effectsPool,
                ...entities,
                playerBulletPool,
                enemyBulletPool,
            ].forEach(thisEntity => {
                thisEntity.image = thisEntity.images?.[currentDimension] ?? thisEntity.image;

                // knockback ticks
                if (thisEntity.knockDx) {
                    thisEntity.x += thisEntity.knockDx;
                    thisEntity.knockDx *= 0.85;
                }
                if (thisEntity.knockDy) {
                    // console.log('e.knockDy', e.knockDy);
                    thisEntity.y += thisEntity.knockDy;
                    thisEntity.knockDy *= 0.85;
                }

                // ai targeting: chase, avoid, wander
                if (thisEntity.targetX != null) {
                    const distToPlayer = player.position.distance(thisEntity);

                    if (thisEntity.b?.includes('<') && fixedGameTime > thisEntity.aiNextTick && thisEntity.dimension == player.dimension) {
                        // chase target
                        const rotation = angleToTarget(player, thisEntity) - Math.PI / 2 + Math.random() - 0.5;
                        thisEntity.targetX = player.x + Math.cos(rotation) * thisEntity.strafe;
                        thisEntity.targetY = player.y + Math.sin(rotation) * thisEntity.strafe;
                        thisEntity.s = 1 * thisEntity.speed;
                        if (thisEntity.strafe > 0) thisEntity.aiNextTick = fixedGameTime + 3000;

                    } else if (thisEntity.b?.includes('>') && thisEntity.dimension == player.dimension) {
                        // avoid target
                        if (distToPlayer < 100) {
                            thisEntity.targetX = thisEntity.x + (thisEntity.x - player.x) / distToPlayer * 100;
                            thisEntity.targetY = thisEntity.y + (thisEntity.y - player.y) / distToPlayer * 100;
                            thisEntity.s = 0.5 * thisEntity.speed;
                            thisEntity.aiNextTick = fixedGameTime + 2000;

                        } else if (fixedGameTime > thisEntity.aiNextTick) {
                            const randomVector = randomUnitVector();
                            const randomDistance = Math.random() * 32 + 16;
                            thisEntity.targetX = thisEntity.x + randomVector.x * randomDistance;
                            thisEntity.targetY = thisEntity.y + randomVector.y * randomDistance;
                            thisEntity.s = 0.5 * thisEntity.speed;
                            thisEntity.aiNextTick = fixedGameTime + 2000;
                        }
                    } else if (thisEntity.b?.includes('.') && fixedGameTime > thisEntity.aiNextTick) {
                        // wander
                        const randomVector = randomUnitVector();
                        const randomDistance = Math.random() * 32 + 16;
                        thisEntity.targetX = thisEntity.x + randomVector.x * randomDistance;
                        thisEntity.targetY = thisEntity.y + randomVector.y * randomDistance;
                        thisEntity.s = 0.5 * thisEntity.speed;
                        thisEntity.aiNextTick = fixedGameTime + 2000;
                    }
                    // shoot enemy bullet
                    if (thisEntity.b?.includes('s') && currentDimension == thisEntity.dimension && distToPlayer < 250 && fixedGameTime >= thisEntity.nextCanShoot) {
                        /* #IfDev */
                        // console.log('enemy shoot');
                        /* #EndIfDev */
                        const rotation = angleToTarget(thisEntity, player) - Math.PI / 2;

                        const bulletSpeed = 1.2;
                        const enemyBullet = enemyBulletPool.get({
                            /* #IfDev */
                            name: 'EnemyBullet',
                            /* #EndIfDev */
                            x: thisEntity.x + Math.cos(rotation) * 12, // starting x,y position of the sprite
                            y: thisEntity.y + Math.sin(rotation) * 12,
                            width: 5,              // width and height of the sprite rectangle
                            height: 5,
                            dx: Math.cos(rotation) * bulletSpeed,
                            dy: Math.sin(rotation) * bulletSpeed,
                            render() {
                                context.fillStyle = colors.orange;
                                context.beginPath();
                                context.ellipse(this.width / 2, this.height / 2, 5, 3, /* this.seed * Math.PI + */ 2 * Math.PI * (fixedGameTime % 1000) / 1000, 0, 2 * Math.PI);
                                context.fill();
                            },

                            ttl: 3000,
                            anchor: { x: 0.5, y: 0.5 },
                            update: bulletUpdate,
                            // custom properties
                            seed: Math.random(),
                            dimension: player.dimension,
                            bulletSpeed,
                            team: TEAM_ENEMY,
                        });
                        thisEntity.nextCanShoot = fixedGameTime + 2000;
                    }
                    // move
                    const distToTarget = Math.hypot(thisEntity.x - thisEntity.targetX, thisEntity.y - thisEntity.targetY);
                    if (distToTarget < (thisEntity.s ?? thisEntity.speed)) {
                        thisEntity.x = thisEntity.targetX, thisEntity.y = thisEntity.targetY;
                    } else {
                        thisEntity.x += (thisEntity.targetX - thisEntity.x) / distToTarget * (thisEntity.s ?? thisEntity.speed);
                        thisEntity.y += (thisEntity.targetY - thisEntity.y) / distToTarget * (thisEntity.s ?? thisEntity.speed);
                    }
                }

                // ai respawn
                if (thisEntity.returnHp) {
                    thisEntity.hp++;
                    if (thisEntity.hp >= thisEntity.returnHp) {
                        thisEntity.spawnEntity();
                        thisEntity.ttl = 0;

                        spawnGraphicsEffect(1, thisEntity, 0, 16, colors.lightGray, 0, 15);
                    }
                }
                thisEntity.update();


                // collision
                const collisions = entities.filter(entity => (
                    entity != thisEntity &&
                    entity.position.distance(thisEntity) < (entity.size ?? entity.width) * 3 / 8 + (thisEntity.size ?? thisEntity.width) * 3 / 8
                ));

                const enemyCollideWithPlayer = collisions.some(entity => entity == player);
                // if spectral enemy collides spectral player
                if (enemyCollideWithPlayer && currentDimension == SPECTRAL_DIMENSION && thisEntity.returnHp) {
                    // eat ghostFire
                    audio.play('coin');
                    energy++;
                    enemyCount--;
                    thisEntity.ttl = 0;


                    spawnGraphicsEffect(3, thisEntity, -Math.PI / 2, 20, colors.white, energy + '/' + respawnEnergyCost, 60);
                    // add to resurrection energy
                }

                // if physical enemy collides physical player
                if (enemyCollideWithPlayer && currentDimension == PHYSICAL_DIMENSION && thisEntity.dimension == PHYSICAL_DIMENSION) {
                    // kill player into spectral dimension

                    currentDimension = BETWEEN_DIMENSION1;
                    player.dimension = currentDimension;

                    dimensionAlpha = 0;
                    dimensionTransitionUntil = fixedGameTime + DIMENSION_TRANSITION_LENGTH1;
                    // console.log('currentDimension', currentDimension);

                    player.dx = 0;
                    player.dy = 0;
                    energy = 0;
                    scoreMultiplier = levelUpEnergyGoal;
                    scoreMultiplierAck = 1;
                    respawnEnergyTimeLimit = fixedGameTime + 13 * 1000;
                    entities.filter(e => e.box == 1).forEach(e => e.ttl = 0);

                    audio.play('death');
                }

                // if physical enemy collides spectral player
                if (enemyCollideWithPlayer && currentDimension == SPECTRAL_DIMENSION && thisEntity.dimension == PHYSICAL_DIMENSION) {
                    // damage enemy
                    audio.play('hit');
                    thisEntity.hp -= 5;
                    if (thisEntity.hp <= 0) {
                        score += 10 * (scoreMultiplier / levelUpEnergyGoal | 0);
                        scoreMultiplier++;
                        audio.play('explosion');
                        thisEntity.ttl = 0;
                        thisEntity.onDeathSpawn?.();
                    }
                    // knockback player

                    player.knockDx = Math.cos(player.frontRotation + Math.PI) * 12;
                    player.knockDy = Math.sin(player.frontRotation + Math.PI) * 12;


                    // // snap knockback to 1 dimension
                    // if (Math.abs(player.knockDx) > Math.abs(player.knockDy)) {
                    //     player.knockDx = Math.sign(player.knockDx) * 12;
                    //     player.knockDy = 0;
                    // } else {
                    //     player.knockDx = 0;
                    //     player.knockDy = Math.sign(player.knockDy) * 12;
                    // }

                    /* #IfDev */
                    // console.log('knock player', player.knockDx, player.knockDy);
                    /* #EndIfDev */
                }

                if (thisEntity != player && collisions.length) {
                    const closest = collisions[0];
                    const dist = closest.position.distance(thisEntity);
                    if (dist > 0.01) {
                        thisEntity.x += (thisEntity.x - closest.x) / dist * 0.2;
                        thisEntity.y += (thisEntity.y - closest.y) / dist * 0.2;
                    }
                }
                if (thisEntity.x - thisEntity.width / 2 < 0) thisEntity.x = thisEntity.width / 2;
                if (thisEntity.x + thisEntity.width / 2 > canvas.width) thisEntity.x = canvas.width - thisEntity.width / 2;
                if (thisEntity.y - thisEntity.height / 2 < 0) thisEntity.y = thisEntity.height / 2;
                if (thisEntity.y + thisEntity.height / 2 > canvas.height) thisEntity.y = canvas.height - thisEntity.height / 2;
            });
            entities = entities.filter(e => e.ttl > 0);

            if (currentDimension == PHYSICAL_DIMENSION || currentDimension == SPECTRAL_DIMENSION) {
                const pointer = getPointer();
                const pointerDirection = angleToTarget(player, pointer) - Math.PI / 2; // minus Math.PI / 2 to fix a bug of angleToTarget()

                player.dy = input.u ? -player.speed : input.d ? +player.speed : 0;
                player.dx = input.l ? -player.speed : input.r ? +player.speed : 0;

                if (currentDimension == SPECTRAL_DIMENSION) {

                    // dash towards mouse position
                    if (pointerPressed('left')) {
                        player.frontRotation = lerpRadians(player.frontRotation, pointerDirection, 1);
                    } else {

                        const keyboardRotation = Math.atan2(
                            input.u ? -1 : input.d ? +1 : 0,
                            input.l ? -1 : input.r ? +1 : 0
                        );
                        if (input.u || input.d || input.l || input.r) {
                            player.frontRotation = lerpRadians(player.frontRotation, keyboardRotation, 1);
                        }
                    }

                    player.dx = Math.cos(player.frontRotation) * Math.min(player.position.distance(pointer), player.speed * 2);
                    player.dy = Math.sin(player.frontRotation) * Math.min(player.position.distance(pointer), player.speed * 2);



                    // if (player.position.distance(pointer) < player.speed * 2) {
                    //     player.dx = 0;
                    //     player.dy = 0;
                    // }

                    // if (pointerPressed('left') && player.knockDx < 0.1 && player.knockDy < 0.1) {
                    //     player.knockDx = Math.cos(angleToPointer) * 10;
                    //     player.knockDy = Math.sin(angleToPointer) * 10;
                    //     // player.frontRotation = lerpRadians(player.frontRotation, pointerDirection, 1);
                    // }

                    // const keyboardRotation = Math.atan2(
                    //     input.u ? -1 : input.d ? +1 : 0,
                    //     input.l ? -1 : input.r ? +1 : 0
                    // );
                    // if (input.u || input.d || input.l || input.r) {
                    //     player.frontRotation = lerpRadians(player.frontRotation, keyboardRotation, 1);
                    // }


                    // player.dx = Math.cos(player.frontRotation) * Math.min(player.position.distance(pointer), player.speed * 1.5);
                    // player.dy = Math.sin(player.frontRotation) * Math.min(player.position.distance(pointer), player.speed * 1.5);

                    // after-image
                    spawnSpriteEffect(1, player, player.frontRotation + Math.PI, 4, images.playerSpectralDash,
                        (respawnEnergyTimeLimit - fixedGameTime) / 1000 * 4 | 0
                    );
                }

                if (pointerPressed('left') && fixedGameTime >= player.nextCanShoot) {
                    // console.log('pointerPressed', mainWeapon);
                    if (currentDimension == PHYSICAL_DIMENSION && mainWeapon == MAIN_DUAL_PISTOL) {
                        const bulletSpeed = 20;
                        const bullet = playerBulletPool.get({
                            /* #IfDev */
                            name: 'bullet',
                            /* #EndIfDev */
                            x: player.x + Math.cos(pointerDirection + gunSide * 0.4) * 12,               // starting x,y position of the sprite
                            y: player.y + Math.sin(pointerDirection + gunSide * 0.4) * 12,
                            color: colors.white,  // fill color of the sprite rectangle
                            width: 8,           // width and height of the sprite rectangle
                            height: 2,
                            dx: Math.cos(pointerDirection) * bulletSpeed,
                            dy: Math.sin(pointerDirection) * bulletSpeed,
                            rotation: pointerDirection,
                            ttl: 3000,
                            anchor: { x: 0.5, y: 0.5 },
                            update: bulletUpdate,
                            // custom properties
                            dimension: player.dimension,
                            bulletSpeed,
                            team: TEAM_PLAYER,
                        });
                        gunSide = -gunSide;
                        player.nextCanShoot = fixedGameTime + 200;
                        audio.play('shoot');
                    }
                    if (currentDimension == PHYSICAL_DIMENSION && mainWeapon == MAIN_MACHINE_GUN) {
                        const bulletSpeed = 20;
                        const bulletRotation = pointerDirection + Math.random() * 0.2 - 0.1;
                        const bullet = playerBulletPool.get({
                            /* #IfDev */
                            name: 'bullet',
                            /* #EndIfDev */
                            x: player.x + Math.cos(pointerDirection + 0.4) * 12,               // starting x,y position of the sprite
                            y: player.y + Math.sin(pointerDirection + 0.4) * 12,
                            color: colors.white,  // fill color of the sprite rectangle
                            width: 8,           // width and height of the sprite rectangle
                            height: 2,
                            dx: Math.cos(bulletRotation) * bulletSpeed,
                            dy: Math.sin(bulletRotation) * bulletSpeed,
                            rotation: bulletRotation,
                            ttl: 3000,
                            anchor: { x: 0.5, y: 0.5 },
                            update: bulletUpdate,
                            // custom properties
                            dimension: player.dimension,
                            bulletSpeed,
                            team: TEAM_PLAYER,
                        });
                        player.nextCanShoot = fixedGameTime + 100;
                        audio.play('shoot');
                    }
                    if (currentDimension == PHYSICAL_DIMENSION && mainWeapon == MAIN_SHOTGUN) {
                        const bulletSpeed = 20;
                        for (let i = 0; i < 15; i++) {
                            const bulletRotation = pointerDirection + Math.random() * 0.8 - 0.4;
                            const bullet = playerBulletPool.get({
                                /* #IfDev */
                                name: 'bullet',
                                /* #EndIfDev */
                                x: player.x + Math.cos(pointerDirection + 0.4) * 12,               // starting x,y position of the sprite
                                y: player.y + Math.sin(pointerDirection + 0.4) * 12,
                                color: colors.white,  // fill color of the sprite rectangle
                                width: 8,           // width and height of the sprite rectangle
                                height: 2,
                                dx: Math.cos(bulletRotation) * bulletSpeed,
                                dy: Math.sin(bulletRotation) * bulletSpeed,
                                rotation: bulletRotation,
                                ttl: 10,
                                anchor: { x: 0.5, y: 0.5 },
                                update: bulletUpdate,
                                // custom properties
                                dimension: player.dimension,
                                bulletSpeed,
                                team: TEAM_PLAYER,
                            });
                            setTimeout(() => {
                                audio.play('shoot');
                            }, i * 10);

                        }
                        player.nextCanShoot = fixedGameTime + 800;
                    }
                }
            }
            HandleSpawnTick();

            // multiplier limit, multiplier cap
            scoreMultiplier = Math.min(10 * levelUpEnergyGoal, scoreMultiplier);
            // energy
            // console.log('scoreMultiplier', (scoreMultiplier / levelUpEnergyGoal | 0), scoreMultiplierAck);
            if (currentDimension == PHYSICAL_DIMENSION && entities.filter(e => e.box == 1).length < (scoreMultiplier / levelUpEnergyGoal | 0) - scoreMultiplierAck) {
                const nextWeapon = Math.min(mainWeaponImages.length - 1, mainWeapon + 1);
                const pos = getFreeSpace();
                if (pos) spawnBox(pos.x, pos.y, nextWeapon);
            }
            // if (currentDimension == PHYSICAL_DIMENSION && energy >= respawnEnergyGoal) {
            //     audio.play('respawn');

            // }
            // time is up
            if (currentDimension == SPECTRAL_DIMENSION && fixedGameTime >= respawnEnergyTimeLimit) {
                if (energy < respawnEnergyCost) {
                    // game over
                    gameIsOver++;

                    audio.play('game_over');
                } else {
                    // respawn

                    if (energy >= respawnEnergyCost * 2) {
                        // add 1 to multiplier
                        scoreMultiplier += levelUpEnergyGoal;

                        spawnGraphicsEffect(3, player, -Math.PI / 2, 20, colors.white, `Souls bonus (${respawnEnergyCost * 2}+)`, 60);
                    }

                    currentDimension = PHYSICAL_DIMENSION;
                    player.dimension = currentDimension;
                    energy = 0;
                    respawnEnergyCost = Math.ceil(respawnEnergyCost * DIFFICULTY_RATIO);
                    /* #IfDev */
                    console.log('new respawnEnergyCost', respawnEnergyCost);
                    /* #EndIfDev */
                    audio.play('respawn');

                    // radial knockback
                    entities
                        .filter(entity => entity != player && player.position.distance(entity) < 100)
                        .forEach(entity => {
                            entity.knockDx = (entity.x - player.x) / player.position.distance(entity) * 12;
                            entity.knockDy = (entity.y - player.y) / player.position.distance(entity) * 12;
                        });
                    entities
                        .filter(entity => entity.b?.includes('s'))
                        .forEach(entity => {
                            entity.nextCanShoot = fixedGameTime + 1000 + Math.random() * 1000;
                        });

                    // tutorial
                    if (tutProgress == 1) tutProgress++;
                }
            }

            // dimension change
            if (currentDimension == BETWEEN_DIMENSION1 && fixedGameTime >= dimensionTransitionUntil) {
                // silence
                currentDimension = BETWEEN_DIMENSION2;
                dimensionTransitionUntil = fixedGameTime + DIMENSION_TRANSITION_LENGTH2;
                player.dimension = currentDimension;
            }
            else if (currentDimension == BETWEEN_DIMENSION2 && fixedGameTime >= dimensionTransitionUntil) {
                currentDimension = BETWEEN_DIMENSION3;
                dimensionTransitionUntil = fixedGameTime + DIMENSION_TRANSITION_LENGTH3;
                player.dimension = currentDimension;
                audio.play('enter_spectral');
            }
            else if (currentDimension == BETWEEN_DIMENSION3 && fixedGameTime >= dimensionTransitionUntil) {
                currentDimension = SPECTRAL_DIMENSION;
                player.dimension = currentDimension;
            }
        },
        render() { // render the game state
            context2.clearRect(0, 0, canvas2.width, canvas2.height);
            context.save();
            // background
            context.fillStyle = BACKGROUND_COLOR;
            context.fillRect(0, 0, canvas.width, canvas.height);
            const gradient = context.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 30,
                canvas.width / 2, canvas.height / 2, 300);
            gradient.addColorStop(0, colors.darkBlue);
            gradient.addColorStop(1, colors.black);


            // background fade-in-out
            if (currentDimension == SPECTRAL_DIMENSION || currentDimension == PHYSICAL_DIMENSION) {
                dimensionAlpha = currentDimension;
            } else if (currentDimension == BETWEEN_DIMENSION3 && dimensionTransitionUntil - fixedGameTime < DIMENSION_TRANSITION_LENGTH3) {
                dimensionAlpha = 1 - (dimensionTransitionUntil - fixedGameTime) / DIMENSION_TRANSITION_LENGTH3 // Math.sign(currentDimension - dimensionAlpha) * 0.05;
            }

            // spectral background
            if (currentDimension == SPECTRAL_DIMENSION) {
                context.fillStyle = gradient;
                context.globalAlpha = dimensionAlpha;
                // FIXME: alpha does not work with firefox https://bugzilla.mozilla.org/show_bug.cgi?id=1164912
                // temp-fixed with on/off feature, but transparency still does not work
                context.fillRect(0, 0, canvas.width, canvas.height);
                // context.globalAlpha = 1;
            }
            // render some tiles
            context.globalAlpha = 0.4;
            ;[
                [16 * 5, 16 * 6],
                [16 * 5, 16 * 7],
                [16 * 6, 16 * 7],
                [16 * 7, 16 * 7],
                [16 * 6, 16 * 8],

                [16 * 15, 16 * 3],

                [16 * 17, 16 * 9],
                [16 * 18, 16 * 9],
                [16 * 19, 16 * 9],
                [16 * 18, 16 * 10],
                [16 * 19, 16 * 10],
                [16 * 20, 16 * 10],

                [16 * 25, 16 * 2],
                [16 * 25, 16 * 3],
                [16 * 25, 16 * 4],
                [16 * 25, 16 * 5],
                [16 * 25, 16 * 6],
                [16 * 26, 16 * 3],
                [16 * 26, 16 * 4],
                [16 * 26, 16 * 5],
                [16 * 26, 16 * 6],
                [16 * 26, 16 * 7],

                [16 * 10, 16 * 13],
                [16 * 11, 16 * 13],
                [16 * 12, 16 * 13],
                [16 * 13, 16 * 14],
                [16 * 13, 16 * 15],
                [16 * 14, 16 * 14],
            ].forEach(([x, y]) => context.drawImage(images.floorTile1, x, y));
            context.globalAlpha = 1;

            // render all entities
            [
                effectsPool,
                ...entities,
                playerBulletPool,
                enemyBulletPool,
            ].forEach(e => {
                if (e != player || currentDimension == PHYSICAL_DIMENSION || currentDimension == SPECTRAL_DIMENSION) e.render();

                // draw a bar for respawning spectral entities
                if (e.returnHp - e.hp < 180) {
                    context.fillStyle = colors.lightGray;
                    context.globalAlpha = 0.3;
                    context.fillRect(e.x - e.width / 2 | 0, e.y + 12 | 0, e.width, 2);
                    context.globalAlpha = 1;
                    context.fillRect(e.x - e.width / 2 | 0, e.y + 12 | 0, e.width * (180 - e.returnHp + e.hp) / 180, 2);
                }
            });


            if (currentDimension == BETWEEN_DIMENSION1) {
                // death? animation
                let progress = 1 - (dimensionTransitionUntil - fixedGameTime) / DIMENSION_TRANSITION_LENGTH1;
                progress *= progress;
                const ww = player.image.width + 10000 * progress;
                const hh = player.image.height * (1 - progress);
                context.drawImage(player.image, player.x - ww / 2, player.y - hh / 2, ww, hh);
            } else if (currentDimension == BETWEEN_DIMENSION3) {
                // death? animation
                let progress = (dimensionTransitionUntil - fixedGameTime) / DIMENSION_TRANSITION_LENGTH3;
                progress *= progress;
                const ww = player.image.width + 10000 * progress;
                const hh = player.image.height * (1 - progress);
                context.drawImage(player.image, player.x - ww / 2, player.y - hh / 2, ww, hh);
            } else {
                const pointer = getPointer();
                const xx = player.x;
                const yy = player.y;
                const aimX = pointer.x - xx;
                const aimY = pointer.y - yy;

                context.save();
                context.strokeStyle = currentDimension ? colors.blue : colors.orange;
                context.lineWidth = 1;
                context.globalAlpha = 0.3;

                context.beginPath();
                context.moveTo(xx, yy);
                context.lineTo(xx + aimX * 100, yy + aimY * 100);
                context.stroke();

                context.beginPath();
                context.moveTo(xx, yy);
                context.lineTo(xx + Math.cos(player.frontRotation) * 16, yy + Math.sin(player.frontRotation) * 16);
                context.stroke();
                context.restore();
            }

            // energy bar

            // const padding = 40;
            // const _y = 280 * 2;
            // const barWidth = (canvas2.width - padding - padding) * Math.min(1, energy / levelUpEnergyGoal);
            // const respawnEnergyGoalX = (padding + (canvas2.width - padding - padding) * respawnEnergyGoal / levelUpEnergyGoal) | 0;
            // const levelUpEnergyGoalX = (padding + (canvas2.width - padding - padding)) | 0;

            // context2.globalAlpha = 0.7;
            // context2.fillStyle = colors.darkGray;
            // context2.fillRect(padding + barWidth, _y + 4, canvas2.width - padding - padding - barWidth, 8);

            // context2.fillStyle = (currentDimension == SPECTRAL_DIMENSION ? colors.blue : colors.orange);

            // if (energy < levelUpEnergyGoal || (fixedGameTime % 1000) > 500) context.globalAlpha = 0.5;

            // context2.fillRect(padding, _y, barWidth, 16);


            // context2.strokeStyle = currentDimension ? colors.blue : colors.orange;
            // context2.lineWidth = 1;

            // context2.beginPath();
            // context2.moveTo(respawnEnergyGoalX, _y - 8);
            // context2.lineTo(respawnEnergyGoalX, _y + 16 + 8);
            // context2.stroke();

            // context2.beginPath();
            // context2.moveTo(levelUpEnergyGoalX, _y - 8);
            // context2.lineTo(levelUpEnergyGoalX, _y + 16 + 8);
            // context2.stroke();

            // context2.globalAlpha = 1;

            // context2.font = '16px sans-serif';
            // context2.fillStyle = colors.white;
            // context2.textAlign = 'right';
            // context2.fillText(currentDimension == SPECTRAL_DIMENSION ? 'Respawn' : '1-up', respawnEnergyGoalX - 4, _y + 40);
            // context2.fillText(currentDimension == SPECTRAL_DIMENSION ? 'Bonus' : 'Level up', levelUpEnergyGoalX - 4, _y + 40);


            // score
            context2.textAlign = 'left';
            context2.fillStyle = colors.white;
            context2.font = '16px sans-serif';
            context2.fillText('Score:', 64 - 40, 64 - 20);
            context2.font = '28px sans-serif';
            context2.fillText(score, 64 - 40 + 48, 64 - 20);

            // combo
            if (scoreMultiplier > 10) {
                context2.font = '16px sans-serif';
                context2.fillText('Combo:', 64 - 40, 64 + 20 + 10);
                context2.textAlign = 'center';
                // context2.font = '28px sans-serif';
                context2.fillText((scoreMultiplier / levelUpEnergyGoal | 0) + 'x', 64 + 52, 64 + 20 + 10);

                context2.strokeStyle = colors.white;
                context2.lineWidth = 4;
                context2.beginPath();
                context2.arc(64 + 52, 64 + 24, 24, Math.PI, Math.PI + (scoreMultiplier % levelUpEnergyGoal) / levelUpEnergyGoal * 2 * Math.PI);
                context2.stroke();
            }

            // Revive cost
            const hasEnoughGhostFire = (entities.filter(e => e.returnHp != null).length >= (respawnEnergyCost - energy));
            context2.textAlign = 'left';
            context2.fillStyle = colors.white;
            context2.font = '16px sans-serif';
            context2.fillText('Revive cost:', canvas2.width - 64 - 40 - 48, 64 - 20);
            context2.font = '28px sans-serif';
            context2.fillStyle = !hasEnoughGhostFire ? colors.orange : colors.white;
            context2.fillText(respawnEnergyCost + (!hasEnoughGhostFire ? '!!' : ''), canvas2.width - 64 - 40 + 48, 64 - 20);
            context2.fillStyle = colors.white;

            // main weapon
            context2.beginPath();
            context2.arc(64 - 40 + 20, canvas2.height - 64 + 20, 20, 0, 2 * Math.PI);
            context2.fill();
            if (mainWeaponImages[mainWeapon]) {
                context2.drawImage(
                    mainWeaponImages[mainWeapon],
                    64 - 40 + 4,
                    canvas2.height - 64 + 4,
                    32,
                    32
                );
            }
            context2.font = '16px sans-serif';
            context2.textAlign = 'left';
            context2.fillText(mainWeaponNames[mainWeapon], 64 - 40 + 48, canvas2.height - 64 + 20 + 8);


            if (!gameIsOver) {
                // titles
                context2.font = '120px sans-serif';
                context2.textAlign = 'center';
                context2.fillStyle = colors.white;

                if (currentDimension == SPECTRAL_DIMENSION && respawnEnergyTimeLimit - fixedGameTime < 10 * 1000) {
                    context2.globalAlpha = 0.8;
                    context2.fillText(((respawnEnergyTimeLimit - fixedGameTime) / 1000) | 0, canvas2.width / 2, canvas2.height / 2);
                }
                if (tutProgress == 0) {
                    context2.font = '72px sans-serif';
                    context2.fillText('Spectral-Shooter', canvas2.width / 2, canvas2.height / 2 - 120);
                }

                // style for tutorial text
                context2.font = '16px sans-serif';
                context2.textAlign = 'center';
                context2.fillStyle = colors.white;
                context2.globalAlpha = 1;

                // tutorial
                if (tutProgress == 0) {
                    context2.fillText('A js13k game By Dickson', canvas2.width / 2, canvas2.height / 2 - 80);
                    context2.fillText('Use WASD, ZQSD, or ← ↓ ↑ → to move.', canvas2.width / 2, 520);
                    context2.fillText('Collect power-up to start game.', canvas2.width / 2, 560);
                }
                // if (tutProgress == 1) context2.fillText('Point mouse at ghost fire', canvas2.width / 2, 520);
                else if (tutProgress == 2 && score < 100 && currentDimension == PHYSICAL_DIMENSION) {
                    context2.fillText('Use mouse to aim, left click to shoot,', canvas2.width / 2, 60);
                    context2.fillText('Avoid physical enemies.', canvas2.width / 2, 100);
                }
                else if (tutProgress == 2 && score < 300 && currentDimension == PHYSICAL_DIMENSION) {
                    context2.fillText(`Monsters can respawn from the dead, but so can you.`, canvas2.width / 2, 60);
                    context2.fillText(`Collect an upgrade to start Spectral Dash!`, canvas2.width / 2, 100);
                }


                if (currentDimension == SPECTRAL_DIMENSION && respawnEnergyCost > energy) {
                    if (tutProgress == 1) {
                        // context2.fillText(`Point mouse at ghost fire,`, canvas2.width / 2, 60);
                        context2.fillText(`Use keyboard or click to move in spectral form,`, canvas2.width / 2, 100);
                    }
                    context2.fillText(`Collect ${energy}/${respawnEnergyCost} souls to respawn.`, canvas2.width / 2, 60);

                } else if (currentDimension == SPECTRAL_DIMENSION) {
                    context2.fillText(`Respawning shortly...`, canvas2.width / 2, 100);
                }

            }

            if (gameIsOver) {
                // if (true) {
                gameIsOver++;

                context2.fillStyle = colors.black;
                context2.globalAlpha = Math.min(1, gameIsOver / 5 / 60) * 0.7;
                context2.fillRect(0, 0, canvas2.width, canvas2.height);
                context2.globalAlpha = 1;

                let _y = 180;
                context2.fillStyle = colors.white;
                context2.textAlign = 'center';
                context2.font = '72px sans-serif';
                context2.fillText('Game Over', canvas2.width / 2, _y += 20);

                _y += 20
                _y += 20
                let __y = _y;

                context2.font = '16px sans-serif';
                context2.textAlign = 'right';
                context2.fillText('Score: ', canvas2.width / 2, _y += 20);
                _y += 20
                context2.fillText('Time: ', canvas2.width / 2, _y += 20);
                context2.fillText('Highest combo: ', canvas2.width / 2, _y += 20);
                context2.fillText('Kills: ', canvas2.width / 2, _y += 20);
                context2.fillText('Souls collected: ', canvas2.width / 2, _y += 20);


                context2.textAlign = 'left';
                context2.font = '28px sans-serif';
                context2.fillText(score, canvas2.width / 2, __y += 20); // Score
                context2.font = '16px sans-serif';
                __y += 20
                context2.fillText(`${time}s (${0}s in spectral world)`, canvas2.width / 2, __y += 20); // Time
                context2.fillText(`0x (10s)`, canvas2.width / 2, __y += 20); // Highest combo
                context2.fillText(`${0} (${0}, 0, 0)`, canvas2.width / 2, __y += 20); // Kills
                context2.fillText(`${0} (${0}, 0, 0)`, canvas2.width / 2, __y += 20); // Complete kills


                context2.textAlign = 'center';
                context2.fillText('Press <Enter> to restart', canvas2.width / 2, 500);
                context2.fillText(`Collect ${energy}/${respawnEnergyCost} souls to respawn.`, canvas2.width / 2, 560);
            }

            if (gameIsPaused) {
                context2.fillStyle = colors.white;
                context2.textAlign = 'center';
                context2.font = '16px sans-serif';
                context2.fillText('Game Paused', canvas2.width / 2, 500);
            }


            // border
            context2.strokeStyle = colors.white;
            context2.lineWidth = 1.5;
            context2.strokeRect(10, 10, canvas2.width - 20, canvas2.height - 20);


            context.restore();
        }

    });

    loop.start();    // start the game
    function restart() {
        // cleanup
        loop.stop();

        window.removeEventListener('keydown', keyHandler);
        window.removeEventListener('keyup', keyHandler);
        canvas.removeEventListener('pointerenter', _focus);

        // restart
        start();
    }
}

window.onload = start;