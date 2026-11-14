import React, { useMemo } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'

interface LandingTerrainModelProps {
  modelPath: string
}

// LRO LOLA 15 km x 15 km site terrain (1 UV = 15,000 m, lander at the UV center) with the
// photogrammetric Moon Meteor Regolith 01 PBR set, stochastic anti-tiling and distance fade.
export const LandingTerrainModel: React.FC<LandingTerrainModelProps> = ({ modelPath }) => {
  const { scene } = useGLTF(modelPath)

  // Real photogrammetric lunar-like regolith textures
  const [diffuseMap, normalMap, roughMap, aoMap] = useLoader(THREE.TextureLoader, [
    '/models/moon_texture/textures/moon_meteor_01_diff_2k.jpg',
    '/models/moon_texture/textures/moon_meteor_01_nor_2k.jpg',
    '/models/moon_texture/textures/moon_meteor_01_rough_2k.jpg',
    '/models/moon_texture/textures/moon_meteor_01_ao_2k.jpg',
  ])

  // 16x anisotropic filtering and repeat wrapping
  useMemo(() => {
    ;[diffuseMap, normalMap, roughMap, aoMap].forEach((tex) => {
      if (tex) {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        tex.generateMipmaps = true
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.anisotropy = 16
      }
    })
    if (diffuseMap) diffuseMap.colorSpace = THREE.SRGBColorSpace
    if (normalMap) normalMap.colorSpace = THREE.NoColorSpace
  }, [diffuseMap, normalMap, roughMap, aoMap])

  // Shader with stochastic anti-tiling and natural lunar grey tone
  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#5a606a'), // lunar regolith grey
      map: diffuseMap,
      normalMap: normalMap,
      normalScale: new THREE.Vector2(1.5, 1.5),
      roughnessMap: roughMap,
      roughness: 0.92,
      metalness: 0.02,
      aoMap: aoMap,
      aoMapIntensity: 1.2,
      flatShading: false,
    })

    mat.onBeforeCompile = (shader) => {
      // 1. Albedo: dual non-periodic rotation, faded by distance to the lander (UV center = 0.5, 0.5)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        /* glsl */ `
        #ifdef USE_MAP
          float distToLander = distance(vMapUv, vec2(0.5, 0.5)) * 15000.0;
          float microWeight = 1.0 - smoothstep(1200.0, 3500.0, distToLander);
          const mat2 rotAntiTile = mat2(0.8829, -0.4695, 0.4695, 0.8829);
          vec2 uvA = vMapUv * 260.0;
          vec2 uvB = rotAntiTile * (vMapUv * 367.0) + vec2(0.381, 0.593);
          vec4 colA = texture2D(map, uvA);
          vec4 colB = texture2D(map, uvB);
          vec3 organicMicro = mix(colA.rgb, colB.rgb, 0.5);
          vec3 distantGeology = vec3(0.36, 0.38, 0.42);
          vec3 finalAlbedo = mix(distantGeology, organicMicro * 1.05, microWeight);
          diffuseColor.rgb *= finalAlbedo * 1.05;
        #endif
        `,
      )

      // 2. Normal map: micro-shadows calibrated by distance to the lander
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #ifdef USE_NORMALMAP_TANGENTSPACE
          float distToLanderN = distance(vNormalMapUv, vec2(0.5, 0.5)) * 15000.0;
          float normWeight = 1.0 - smoothstep(1200.0, 3500.0, distToLanderN);
          if (normWeight > 0.01) {
            const mat2 rotAntiTileN = mat2(0.8829, -0.4695, 0.4695, 0.8829);
            vec2 uvAN = vNormalMapUv * 260.0;
            vec2 uvBN = rotAntiTileN * (vNormalMapUv * 367.0) + vec2(0.381, 0.593);
            vec3 nA = texture2D(normalMap, uvAN).xyz * 2.0 - 1.0;
            vec3 nB = texture2D(normalMap, uvBN).xyz * 2.0 - 1.0;
            vec3 nOrganic = normalize(mix(nA, nB, 0.5));
            vec3 mapN = mix(vec3(0.0, 0.0, 1.0), nOrganic, normWeight * 0.95);
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
          }
        #elif defined( USE_NORMALMAP_OBJECTSPACE )
          normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          normal = normalize( normalMatrix * normal );
        #endif
        `,
      )

      // 3. Roughness: smooth attenuation by distance to the lander
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          float distToLanderR = distance(vRoughnessMapUv, vec2(0.5, 0.5)) * 15000.0;
          float roughWeight = 1.0 - smoothstep(1200.0, 3500.0, distToLanderR);
          if (roughWeight > 0.01) {
            const mat2 rotAntiTileR = mat2(0.8829, -0.4695, 0.4695, 0.8829);
            vec2 uvAR = vRoughnessMapUv * 260.0;
            vec2 uvBR = rotAntiTileR * (vRoughnessMapUv * 367.0) + vec2(0.381, 0.593);
            float rA = texture2D(roughnessMap, uvAR).r;
            float rB = texture2D(roughnessMap, uvBR).r;
            float organicRough = mix(rA, rB, 0.5);
            roughnessFactor = mix(roughnessFactor, organicRough, roughWeight * 0.85);
          }
        #endif
        `,
      )
    }
    return mat
  }, [diffuseMap, normalMap, roughMap, aoMap])

  // Clone the GLB scene and apply the material
  const terrain = useMemo(() => {
    const clone = scene.clone(true)
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.receiveShadow = true
        mesh.castShadow = true
        mesh.material = terrainMaterial
        // uv2 channel for the ambient occlusion map (aoMap)
        if (!mesh.geometry.attributes.uv2 && mesh.geometry.attributes.uv) {
          mesh.geometry.setAttribute('uv2', mesh.geometry.attributes.uv)
        }
      }
    })
    return clone
  }, [scene, terrainMaterial])

  return <primitive object={terrain} position={[0, 0, 0]} />
}

useGLTF.preload('/models/shackleton_rim/shackleton_rim_15km.glb')
useGLTF.preload('/models/malapert_massif/malapert_massif_15km.glb')
useGLTF.preload('/models/de_gerlache_rim/de_gerlache_rim_15km.glb')
useGLTF.preload('/models/nobile_rim_1/nobile_rim_1_15km.glb')
