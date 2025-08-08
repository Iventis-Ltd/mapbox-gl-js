import StyleLayer from '../../../src/style/style_layer';
import ModelBucket from '../../data/bucket/model_bucket';
import {getLayoutProperties, getPaintProperties} from './model_style_layer_properties';
import {ZoomDependentExpression} from '../../../src/style-spec/expression/index';
import {mat4} from 'gl-matrix';
import {calculateModelMatrix} from '../../data/model';
import LngLat from '../../../src/geo/lng_lat';
import {latFromMercatorY, lngFromMercatorX} from '../../../src/geo/mercator_coordinate';
import EXTENT from '../../../src/style-spec/data/extent';
import {convertModelMatrixForGlobe, queryGeometryIntersectsProjectedAabb, rotationScaleYZFlipMatrix} from '../../util/model_util';
import Tiled3dModelBucket from '../../data/bucket/tiled_3d_model_bucket';
import {Aabb} from '../../../src/util/primitives';

import type {vec3} from 'gl-matrix';
import type {Transitionable, Transitioning, PossiblyEvaluated, PropertyValue, ConfigOptions} from '../../../src/style/properties';
import type Point from '@mapbox/point-geometry';
import type {LayerSpecification} from '../../../src/style-spec/types';
import type {PaintProps, LayoutProps} from './model_style_layer_properties';
import type {BucketParameters, Bucket} from '../../../src/data/bucket';
import type {TilespaceQueryGeometry} from '../../../src/style/query_geometry';
import type {FeatureState} from '../../../src/style-spec/expression/index';
import type Transform from '../../../src/geo/transform';
import type ModelManager from '../../render/model_manager';
import type {ModelNode} from '../../data/model';
import type {VectorTileFeature} from '@mapbox/vector-tile';
import type {CanonicalTileID} from '../../../src/source/tile_id';
import type {LUT} from "../../../src/util/lut";
import type {EvaluationFeature} from '../../../src/data/evaluation_feature';

class ModelStyleLayer extends StyleLayer {
    override _transitionablePaint: Transitionable<PaintProps>;
    override _transitioningPaint: Transitioning<PaintProps>;
    override paint: PossiblyEvaluated<PaintProps>;
    override layout: PossiblyEvaluated<LayoutProps>;
    modelManager: ModelManager;

    constructor(layer: LayerSpecification, scope: string, lut: LUT | null, options?: ConfigOptions | null) {
        const properties = {
            layout: getLayoutProperties(),
            paint: getPaintProperties()
        };
        super(layer, properties, scope, lut, options);
        this._stats = {numRenderedVerticesInShadowPass : 0, numRenderedVerticesInTransparentPass: 0};
    }

    createBucket(parameters: BucketParameters<ModelStyleLayer>): ModelBucket {
        return new ModelBucket(parameters);
    }

    override getProgramIds(): Array<string> {
        return ['model'];
    }

    override is3D(): boolean {
        return true;
    }

    override hasShadowPass(): boolean {
        return true;
    }

    override canCastShadows(): boolean {
        return true;
    }

    override hasLightBeamPass(): boolean {
        return true;
    }

    override cutoffRange(): number {
        return this.paint.get('model-cutoff-fade-range');
    }

    override queryRadius(bucket: Bucket): number {
        return (bucket instanceof Tiled3dModelBucket) ? EXTENT - 1 : 0;
    }

    override queryIntersectsFeature(
        queryGeometry: TilespaceQueryGeometry,
        feature: VectorTileFeature,
        featureState: FeatureState,
        geometry: Array<Array<Point>>,
        zoom: number,
        transform: Transform,
    ): number | boolean {
        console.log('=== MODEL QUERY START ===', {
            featureId: feature.id,
            featureProperties: feature.properties,
            hasModelManager: !!this.modelManager
        });
        if (!this.modelManager) return false;
        const modelManager = this.modelManager;
        const bucket = queryGeometry.tile.getBucket(this);
        console.log('MODEL QUERY BUCKET:', {
            hasBucket: !!bucket,
            bucketType: bucket ? bucket.constructor.name : 'none',
            isModelBucket: bucket instanceof ModelBucket,
            tileCoord: queryGeometry.tile.tileID,
            hasExpandedProjMatrix: !!(queryGeometry.tile.tileID as any).expandedProjMatrix
        });
        if (!bucket || !(bucket instanceof ModelBucket)) return false;

        for (const modelId in bucket.instancesPerModel) {
            console.log('CHECKING MODEL ID:', modelId);
            const instances = bucket.instancesPerModel[modelId];
            const featureId = feature.id !== undefined ? feature.id :
                (feature.properties && feature.properties.hasOwnProperty("id")) ? (feature.properties["id"] as string | number) : undefined;
            console.log('FEATURE MATCHING:', {
                featureId,
                hasIdToFeaturesIndex: !!instances.idToFeaturesIndex,
                availableFeatureIds: Object.keys(instances.idToFeaturesIndex),
                hasMatchingFeature: instances.idToFeaturesIndex.hasOwnProperty(featureId)
            });
            if (instances.idToFeaturesIndex.hasOwnProperty(featureId)) {
                const modelFeature = instances.features[instances.idToFeaturesIndex[featureId]];
                const model = modelManager.getModel(modelId, this.scope);
                if (!model) return false;

                const matrix: mat4 = mat4.create();
                const position = new LngLat(0, 0);
                const id = bucket.canonical;
                let minDepth = Number.MAX_VALUE;
                for (let i = 0; i < modelFeature.instancedDataCount; ++i) {
                    const instanceOffset = modelFeature.instancedDataOffset + i;
                    const offset = instanceOffset * 16;

                    const va = instances.instancedDataArray.float32;
                    const translation: vec3 = [va[offset + 4], va[offset + 5], va[offset + 6]];

                    // Debug: Check the raw values before truncation
                    const rawPointX = va[offset];
                    const rawPointY = va[offset + 1];
                    const pointX = rawPointX | 0; // Use bitwise OR to match rendering path
                    const pointY = rawPointY | 0; // point.y stored in integer part

                    // Get the tile matrix for this specific tile
                 //   const tileID = queryGeometry.tile.tileID;
                   // const posMatrix = transform.calculatePosMatrix(tileID.toUnwrapped(), transform.worldSize);

                     // Build model matrix in tile space (0-8192 range)
                                // Debug the scale values
                    console.log('SCALE DEBUG:', {
                        modelFeatureScale: modelFeature.scale,
                        modelAABB: model.aabb,
                        modelAABBDimensions: [
                            model.aabb.max[0] - model.aabb.min[0],
                            model.aabb.max[1] - model.aabb.min[1], 
                            model.aabb.max[2] - model.aabb.min[2]
                        ]
                    });
                    
                    // Build model matrix in tile space (0-8192 range)
                                       // Build model matrix in tile space (0-8192 range)
                   const modelMatrix = mat4.create();
                    mat4.identity(modelMatrix);
                    
                   
                    
                    // The model AABB dimensions tell us the model's size in its native units
                    const modelWidth = model.aabb.max[0] - model.aabb.min[0];
                    const modelHeight = model.aabb.max[1] - model.aabb.min[1];
                    const modelDepth = model.aabb.max[2] - model.aabb.min[2];
                    
                    // Calculate scale based on the zoom level and tile size
                    // At zoom 16, EXTENT (8192) represents about 40 meters (depending on latitude)
                    // Scale the model to match its real-world size
                    const zoom = transform.zoom;
                    const pixelsPerMeter = transform.pixelsPerMeter;
                    const tilePixelSize = 512; // Standard tile size in pixels
                    const tileWorldSize = transform.worldSize / Math.pow(2, queryGeometry.tile.tileID.canonical.z);
                    const pixelsToTileUnits = EXTENT / tilePixelSize;
                    
                    // Assume the model is in meters (common for 3D models)
                    // Convert from meters to tile units
                    const metersToPixels = pixelsPerMeter;
                    const pixelsToTileUnits2 = EXTENT / tileWorldSize;
                    const metersToTileUnits = metersToPixels * pixelsToTileUnits2;
                    
                    // Convert translation from meters to appropriate units
                    // X and Y need conversion to tile units, but Z stays in meters
                    const translationInTileUnits: vec3 = [
                        translation[0] * metersToTileUnits,  // Convert X translation to tile units
                        translation[1] * metersToTileUnits,  // Convert Y translation to tile units
                        translation[2]                        // Z stays in meters (no conversion needed)
                    ];
                    
                    // First translate to position within tile
                    mat4.translate(modelMatrix, modelMatrix, [
                        pointX + translationInTileUnits[0],  // X position + X translation in tile units
                        pointY + translationInTileUnits[1],  // Y position + Y translation in tile units
                        translationInTileUnits[2]            // Z translation in meters
                    ]);


                    const adjustedScale: vec3 = [
                        modelFeature.scale[0] * metersToTileUnits,
                        modelFeature.scale[1] * metersToTileUnits,
                        modelFeature.scale[2] //* metersToTileUnits
                    ];
                    
                    console.log('SCALE CALCULATION:', {
                        modelDimensions: {width: modelWidth, height: modelHeight, depth: modelDepth},
                        zoom,
                        pixelsPerMeter,
                        metersToTileUnits,
                        adjustedScale
                    });
                    // Apply rotation AND scale together
                    const rotationMatrix = mat4.create();
                    rotationScaleYZFlipMatrix(rotationMatrix, modelFeature.rotation, adjustedScale);
                    mat4.multiply(modelMatrix, modelMatrix, rotationMatrix);
                    // Get the tile matrix for this specific tile
                    const tileID = queryGeometry.tile.tileID;
                    const posMatrix = transform.calculatePosMatrix(tileID.toUnwrapped(), transform.worldSize);
                    
                    // Combine: tile * model
                    const tileModelMatrix = mat4.multiply([] as any, posMatrix, modelMatrix);
                    
                    // Apply projection
                    const worldViewProjection = mat4.multiply([] as any, transform.projMatrix, tileModelMatrix);
                    const screenQuery = queryGeometry.queryGeometry;
                    const projectedQueryGeometry = screenQuery.isPointQuery() ? screenQuery.screenBounds : screenQuery.screenGeometry;

                    console.log('OFFSET DEBUG:', {
                        clickPoint: projectedQueryGeometry,
                        aabbBounds: "Will be shown in model_util.ts logs",
                        queryFinalMatrix: Array.from(worldViewProjection).slice(0, 8), // First 8 elements
                        note: "Focus on X-axis positioning offset - size correct but shifted",
                        matrixComponents: {
                            modelMatrix: Array.from(matrix).slice(12, 16), // Translation components
                            expandedFarZProj: Array.from(transform.expandedFarZProjMatrix).slice(0, 4) // First row
                        }
                    });

                    console.log('COORDINATE DEBUG:', {
                        queryCoords: {pointX, pointY, position: [position.lng, position.lat]},
                        renderingCoords: "Check RENDERING logs for rawX/rawY/pointX/pointY comparison"
                    });
                    console.log('QUERY GEOMETRY:', {
                        isPointQuery: screenQuery.isPointQuery(),
                        projectedQueryGeometry,
                        transform: {
                            width: transform.width,
                            height: transform.height
                        }
                    });
                    const depth = queryGeometryIntersectsProjectedAabb(projectedQueryGeometry, transform, worldViewProjection, model.aabb);
                    console.log('DEPTH RESULT:', depth);
                    if (depth != null) {
                        minDepth = Math.min(depth, minDepth);
                        console.log('MATCH FOUND! minDepth:', minDepth);
                    }
                }
                if (minDepth !== Number.MAX_VALUE) {
                    return minDepth;
                }
                return false;
            }
        }
        return false;
    }

    override _handleOverridablePaintPropertyUpdate<T, R>(name: string, oldValue: PropertyValue<T, R>, newValue: PropertyValue<T, R>): boolean {
        if (!this.layout || oldValue.isDataDriven() || newValue.isDataDriven()) {
            return false;
        }
        // relayout on programatically setPaintProperty for all non-data-driven properties that get baked into vertex data.
        // Buckets could be updated without relayout later, if needed to optimize.
        return name === "model-color" || name === "model-color-mix-intensity" || name === "model-rotation" || name === "model-scale" || name === "model-translation" || name === "model-emissive-strength";
    }

    _isPropertyZoomDependent(name: string): boolean {
        const prop = this._transitionablePaint._values[name];
        return prop != null && prop.value != null &&
            prop.value.expression != null &&
            prop.value.expression instanceof ZoomDependentExpression;
    }

    isZoomDependent(): boolean {
        return this._isPropertyZoomDependent('model-scale') ||
            this._isPropertyZoomDependent('model-rotation') ||
            this._isPropertyZoomDependent('model-translation');
    }
}

function tileToLngLat(id: CanonicalTileID, position: LngLat, pointX: number, pointY: number) {
    const tileCount = 1 << id.z;
    position.lat = latFromMercatorY((pointY / EXTENT + id.y) / tileCount);
    position.lng = lngFromMercatorX((pointX / EXTENT + id.x) / tileCount);
}

export function loadMatchingModelFeature(bucket: Tiled3dModelBucket, featureIndex: number, tilespaceGeometry: TilespaceQueryGeometry, transform: Transform): {feature: EvaluationFeature, intersectionZ: number, position: LngLat} | undefined {
    const nodeInfo = bucket.getNodesInfo()[featureIndex];

    if (nodeInfo.hiddenByReplacement || !nodeInfo.node.meshes) return;

    let intersectionZ = Number.MAX_VALUE;

    // AABB check
    const node = nodeInfo.node;
    const tile = tilespaceGeometry.tile;
    const tileMatrix = transform.calculatePosMatrix(tile.tileID.toUnwrapped(), transform.worldSize);
    const modelMatrix = tileMatrix;
    const scale = nodeInfo.evaluatedScale;
    let elevation = 0;
    if (transform.elevation && node.elevation) {
        elevation = node.elevation * transform.elevation.exaggeration();
    }
    const anchorX = node.anchor ? node.anchor[0] : 0;
    const anchorY = node.anchor ? node.anchor[1] : 0;

    mat4.translate(modelMatrix, modelMatrix, [anchorX * (scale[0] - 1), anchorY * (scale[1] - 1), elevation]);
    mat4.scale(modelMatrix, modelMatrix, scale);

    // Collision checks are performed in screen space. Corners are in ndc space.
    const screenQuery = tilespaceGeometry.queryGeometry;
    const projectedQueryGeometry = screenQuery.isPointQuery() ? screenQuery.screenBounds : screenQuery.screenGeometry;

    const checkNode = function (n: ModelNode) {
        const worldViewProjectionForNode = mat4.multiply([] as unknown as mat4, modelMatrix, n.matrix);
        mat4.multiply(worldViewProjectionForNode, transform.expandedFarZProjMatrix, worldViewProjectionForNode);
        for (let i = 0; i < n.meshes.length; ++i) {
            const mesh = n.meshes[i];
            if (i === n.lightMeshIndex) {
                continue;
            }
            const depth = queryGeometryIntersectsProjectedAabb(projectedQueryGeometry, transform, worldViewProjectionForNode, mesh.aabb);
            if (depth != null) {
                intersectionZ = Math.min(depth, intersectionZ);
            }
        }
        if (n.children) {
            for (const child of n.children) {
                checkNode(child);
            }
        }
    };

    checkNode(node);
    if (intersectionZ === Number.MAX_VALUE) return;

    const position = new LngLat(0, 0);
    tileToLngLat(tile.tileID.canonical, position, nodeInfo.node.anchor[0], nodeInfo.node.anchor[1]);

    return {intersectionZ, position, feature: nodeInfo.feature};
}

export default ModelStyleLayer;
