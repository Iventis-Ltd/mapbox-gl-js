// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, test, expect} from '../../util/vitest';
import Point from '@mapbox/point-geometry';
import {mat4} from 'gl-matrix';
import {placeGlyphAlongLine} from '../../../src/symbol/projection';
import {getProjection} from '../../../src/geo/projection/index';
import {SymbolLineVertexArray} from '../../../src/data/array_types';
import {OverscaledTileID} from '../../../src/source/tile_id';

describe('placeGlyphAlongLine', () => {
    const projection = getProjection({name: 'mercator'});
    const tileID = new OverscaledTileID(0, 0, 0, 0, 0);
    // With an identity label plane matrix in mercator the label plane coordinates equal the tile coordinates
    const labelPlaneMatrix = mat4.identity([]);
    const textMaxAngleThreshold = Math.cos(Math.PI / 4);

    const createLineVertexArray = (line: Array<Point>) => {
        const lineVertexArray = new SymbolLineVertexArray();
        for (const p of line) lineVertexArray.emplaceBack(p.x, p.y);
        return lineVertexArray;
    };

    // Horizontal line with three vertices, running in the positive x direction
    const line = [new Point(0, 0), new Point(10, 0), new Point(20, 0)];
    const lineVertexArray = createLineVertexArray(line);

    type Options = {
        offsetX: number;
        anchor: Point;
        anchorSegment: number;
        lineOffsetX?: number;
        lineOffsetY?: number;
        flip?: boolean;
        returnPathInTileCoords?: boolean;
        vertices?: SymbolLineVertexArray;
        lineStartIndex?: number;
        lineEndIndex?: number;
    };

    const place = ({offsetX, anchor, anchorSegment, lineOffsetX = 0, lineOffsetY = 0, flip = false, returnPathInTileCoords = false, vertices = lineVertexArray, lineStartIndex = 0, lineEndIndex = vertices.length}: Options) => placeGlyphAlongLine(
        offsetX,
        lineOffsetX,
        lineOffsetY,
        flip,
        [anchor.x, anchor.y, 0],
        anchor,
        anchorSegment,
        lineStartIndex,
        lineEndIndex,
        vertices,
        labelPlaneMatrix,
        {},
        null,
        returnPathInTileCoords,
        false,
        projection,
        tileID,
        false,
        textMaxAngleThreshold
    );

    const expectPoint = (actual: ArrayLike<number>, expected: [number, number, number]) => {
        expect(actual[0]).toBeCloseTo(expected[0], 6);
        expect(actual[1]).toBeCloseTo(expected[1], 6);
        expect(actual[2]).toBeCloseTo(expected[2], 6);
    };

    // Angles that differ by a full turn describe the same rotation
    const expectAngle = (actual: number, expected: number) => {
        expect(Math.cos(actual)).toBeCloseTo(Math.cos(expected), 6);
        expect(Math.sin(actual)).toBeCloseTo(Math.sin(expected), 6);
    };

    describe('glyph on the line', () => {
        test('positive offset is interpolated along the following segments', () => {
            const glyph = place({offsetX: 15, anchor: line[0], anchorSegment: 0});

            expectPoint(glyph.point, [15, 0, 0]);
            expectAngle(glyph.angle, 0);
            expect(glyph.up).toEqual([0, 0, 1]);
            // anchor, the vertex that was passed and the glyph position
            expect(glyph.path).toHaveLength(3);
        });

        test('negative offset is interpolated along the preceding segments', () => {
            const glyph = place({offsetX: -15, anchor: line[2], anchorSegment: 1});

            expectPoint(glyph.point, [5, 0, 0]);
            // Placed backwards along the line and rotated by PI, so the glyph keeps the line direction
            expectAngle(glyph.angle, 0);
        });

        test('returns null if the offset does not fit on the line after traversing a segment', () => {
            expect(place({offsetX: 25, anchor: line[0], anchorSegment: 0})).toBeNull();
            expect(place({offsetX: -25, anchor: line[2], anchorSegment: 1})).toBeNull();
        });

        test('returns the path in tile coordinates on request', () => {
            const glyph = place({offsetX: 15, anchor: line[0], anchorSegment: 0, returnPathInTileCoords: true});

            expect(glyph.tilePath).toHaveLength(glyph.path.length);
            expect(glyph.tilePath.at(-1)).toEqual(new Point(15, 0));
        });
    });

    describe('zero offset glyph', () => {
        test('is placed on the anchor with the angle of the anchor segment', () => {
            const diagonal = [new Point(0, 0), new Point(10, 10)];
            const glyph = place({offsetX: 0, anchor: diagonal[0], anchorSegment: 0, vertices: createLineVertexArray(diagonal)});

            expectPoint(glyph.point, [0, 0, 0]);
            expectAngle(glyph.angle, Math.PI / 4);
            expect(glyph.up).toEqual([0, 0, 1]);
        });

        test('is rotated by PI when flipped', () => {
            const glyph = place({offsetX: 0, anchor: line[0], anchorSegment: 0, flip: true});

            expectPoint(glyph.point, [0, 0, 0]);
            expectAngle(glyph.angle, Math.PI);
        });

        test('line offset along the line cancels the glyph offset', () => {
            const glyph = place({offsetX: 5, lineOffsetX: -5, anchor: line[1], anchorSegment: 1});

            expectPoint(glyph.point, [10, 0, 0]);
            expectAngle(glyph.angle, 0);
        });

        test('returns a two point path that starts at the anchor', () => {
            // The collision code drops the first path point of the first and last glyph
            // and requires at least two points to remain, see populateProjectedGlyphAnchors
            const glyph = place({offsetX: 0, anchor: line[1], anchorSegment: 1, returnPathInTileCoords: true});

            expect(glyph.path).toHaveLength(2);
            expectPoint(glyph.path[0], [10, 0, 0]);
            expectPoint(glyph.path[1], [10, 0, 0]);
            // The two points must not share a reference, as the path is transformed in place
            expect(glyph.path[0]).not.toBe(glyph.path[1]);

            expect(glyph.tilePath).toEqual([new Point(10, 0), new Point(10, 0)]);
            expect(glyph.tilePath[0]).not.toBe(glyph.tilePath[1]);
        });

        test('omits the tile path unless requested', () => {
            const glyph = place({offsetX: 0, anchor: line[1], anchorSegment: 1});

            expect(glyph.tilePath).toEqual([]);
        });

        test('is left unrotated if the anchor segment extends past the end of the line', () => {
            // The anchor segment starts at the last vertex, so it has no second vertex to take a direction from
            const glyph = place({offsetX: 0, anchor: line[2], anchorSegment: 2});

            expectPoint(glyph.point, [20, 0, 0]);
            expectAngle(glyph.angle, 0);
        });
    });

    describe('glyph past the end of the line', () => {
        test('line-start: negative offset is extrapolated backwards from the first vertex', () => {
            const glyph = place({offsetX: -5, anchor: line[0], anchorSegment: 0});

            expectPoint(glyph.point, [-5, 0, 0]);
            expectAngle(glyph.angle, 0);
            expect(glyph.up).toEqual([0, 0, 1]);
        });

        test('line-end: positive offset is extrapolated forwards from the last vertex', () => {
            const glyph = place({offsetX: 5, anchor: line[2], anchorSegment: 1});

            expectPoint(glyph.point, [25, 0, 0]);
            expectAngle(glyph.angle, 0);
        });

        test('follows the direction of the anchor segment', () => {
            const diagonal = [new Point(0, 0), new Point(30, 40)];
            const vertices = createLineVertexArray(diagonal);

            const start = place({offsetX: -10, anchor: diagonal[0], anchorSegment: 0, vertices});
            expectPoint(start.point, [-6, -8, 0]);
            expectAngle(start.angle, Math.atan2(40, 30));

            const end = place({offsetX: 10, anchor: diagonal[1], anchorSegment: 0, vertices});
            expectPoint(end.point, [36, 48, 0]);
            expectAngle(end.angle, Math.atan2(40, 30));
        });

        test('uses the segment next to the anchor on a line with a bend', () => {
            const bend = [new Point(0, 0), new Point(10, 0), new Point(10, 10)];
            const vertices = createLineVertexArray(bend);

            const start = place({offsetX: -5, anchor: bend[0], anchorSegment: 0, vertices});
            expectPoint(start.point, [-5, 0, 0]);
            expectAngle(start.angle, 0);

            const end = place({offsetX: 5, anchor: bend[2], anchorSegment: 1, vertices});
            expectPoint(end.point, [10, 15, 0]);
            expectAngle(end.angle, Math.PI / 2);
        });

        test('applies the offset perpendicular to the line', () => {
            const start = place({offsetX: -5, lineOffsetY: 2, anchor: line[0], anchorSegment: 0});
            const end = place({offsetX: 5, lineOffsetY: 2, anchor: line[2], anchorSegment: 1});

            // Both glyphs are shifted to the same side of the line
            expectPoint(start.point, [-5, 2, 0]);
            expectPoint(end.point, [25, 2, 0]);
        });

        test('returns the path in tile coordinates on request', () => {
            const start = place({offsetX: -5, anchor: line[0], anchorSegment: 0, returnPathInTileCoords: true});

            expect(start.path).toHaveLength(2);
            expectPoint(start.path[0], [0, 0, 0]);
            expectPoint(start.path[1], [-5, 0, 0]);
            expect(start.tilePath).toEqual([new Point(0, 0), new Point(-5, 0)]);

            const end = place({offsetX: 5, anchor: line[2], anchorSegment: 1, returnPathInTileCoords: true});

            expect(end.path).toHaveLength(2);
            expect(end.tilePath).toEqual([new Point(20, 0), new Point(25, 0)]);
        });

        test('only considers the vertices of its own line', () => {
            // Two lines share one vertex array: the first uses indices 0-1, the second 2-3
            const vertices = createLineVertexArray([new Point(0, 0), new Point(10, 0), new Point(100, 100), new Point(100, 110)]);

            const end = place({offsetX: 5, anchor: new Point(10, 0), anchorSegment: 0, vertices, lineStartIndex: 0, lineEndIndex: 2});
            expectPoint(end.point, [15, 0, 0]);
            expectAngle(end.angle, 0);

            const start = place({offsetX: -5, anchor: new Point(100, 100), anchorSegment: 0, vertices, lineStartIndex: 2, lineEndIndex: 4});
            expectPoint(start.point, [100, 95, 0]);
            expectAngle(start.angle, Math.PI / 2);
        });

        test('returns null if the anchor segment has no length', () => {
            const degenerate = [new Point(5, 5), new Point(5, 5)];
            const vertices = createLineVertexArray(degenerate);

            expect(place({offsetX: -5, anchor: degenerate[0], anchorSegment: 0, vertices})).toBeNull();
        });
    });
});
