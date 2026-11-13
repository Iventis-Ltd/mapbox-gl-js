// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {describe, test, expect} from '../../util/vitest';
import Point from '@mapbox/point-geometry';
import {getAnchors, getCenterAnchor, getStartAnchor, getEndAnchor} from '../../../src/symbol/get_anchors';

const TILE_EXTENT = 4096;

describe('getAnchors', () => {
    const nonContinuedLine: Array<any> = [];
    for (let i = 1; i < 11; i++) {
        nonContinuedLine.push(new Point(1, i));
    }

    const continuedLine: Array<any> = [];
    for (let j = 0; j < 10; j++) {
        continuedLine.push(new Point(1, j));
    }

    const smallSpacing = 2;
    const bigSpacing = 3;

    const shapedText = {left: -1, right: 1, top: -0.5, bottom: 0.5};
    const shapedIcon = {left: -0.5, right: 0.5, top: -0.25, bottom: 0.25};
    const labelLength = Math.max(
        shapedText ? shapedText.right - shapedText.left : 0,
        shapedIcon ? shapedIcon.right - shapedIcon.left : 0);

    const glyphSize = 0.1;

    test('non-continued line with short labels', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const anchors = getAnchors(nonContinuedLine, bigSpacing, Math.PI, shapedText, shapedIcon, glyphSize, 1, 1, TILE_EXTENT);

        expect(anchors).toEqual([
            {x: 1, y: 2.2, z: 0.0, angle: 1.5707963267948966, segment: 1},
            {x: 1, y: 5.2, z: 0.0, angle: 1.5707963267948966, segment: 4},
            {x: 1, y: 8.2, z: 0.0, angle: 1.5707963267948966, segment: 7}]);

        expect(
            labelLength / 2 + 1 <= anchors[0].y && anchors[0].y < labelLength / 2 + 3 * glyphSize + 1
        ).toBeTruthy();
    });

    test('non-continued line with long labels', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const anchors = getAnchors(nonContinuedLine, smallSpacing, Math.PI, shapedText, shapedIcon, glyphSize, 1, 1, TILE_EXTENT);

        expect(anchors).toEqual([
            {x: 1, y: 2.2, z: 0.0, angle: 1.5707963267948966, segment: 1},
            {x: 1, y: 4.7, z: 0.0, angle: 1.5707963267948966, segment: 3},
            {x: 1, y: 7.2, z: 0.0, angle: 1.5707963267948966, segment: 6}]);
    });

    test('continued line with short labels', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const anchors = getAnchors(continuedLine, bigSpacing, Math.PI, shapedText, shapedIcon, glyphSize, 1, 1, TILE_EXTENT);

        expect(anchors).toEqual([
            {x: 1, y: 1.5, z: 0.0, angle: 1.5707963267948966, segment: 1},
            {x: 1, y: 4.5, z: 0.0, angle: 1.5707963267948966, segment: 4},
            {x: 1, y: 7.5, z: 0.0, angle: 1.5707963267948966, segment: 7}]);
    });

    test('continued line with long labels', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const anchors = getAnchors(continuedLine, smallSpacing, Math.PI, shapedText, shapedIcon, glyphSize, 1, 1, TILE_EXTENT);

        expect(anchors).toEqual([
            {x: 1, y: 1.25, z: 0.0, angle: 1.5707963267948966, segment: 1},
            {x: 1, y: 3.75, z: 0.0, angle: 1.5707963267948966, segment: 3},
            {x: 1, y: 6.25, z: 0.0, angle: 1.5707963267948966, segment: 6}]);
    });

    test('overscaled anchors contain all anchors in parent', () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const anchors = getAnchors(nonContinuedLine, bigSpacing, Math.PI, shapedText, shapedIcon, glyphSize, 1, 1, TILE_EXTENT);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const childAnchors = getAnchors(nonContinuedLine, bigSpacing / 2, Math.PI, shapedText, shapedIcon, glyphSize, 0.5, 2, TILE_EXTENT);
        for (let i = 0; i < anchors.length; i++) {
            const anchor = anchors[i];
            let found = false;
            for (let k = 0; k < childAnchors.length; k++) {
                if (anchor.equals(childAnchors[k])) {
                    found = true;
                    break;
                }
            }
            expect(found).toBeTruthy();
        }
    });

    test('use middle point as a fallback position for short non-continued lines', () => {
        const line = [new Point(1, 1), new Point(1, 3.1)];
        const anchors = getAnchors(line, 2, Math.PI, shapedText, shapedIcon, glyphSize, 1, 1, TILE_EXTENT);
        expect(anchors).toEqual([
            {x: 1, y: 2.05, z: 0.0, angle: 1.5707963267948966, segment: 0}]);
    });

    test('getCenterAnchor', () => {
        const line = [new Point(1, 1), new Point(1, 3.1), new Point(3, 6), new Point(4, 7)];
        const anchor = getCenterAnchor(line, Math.PI, shapedText, shapedIcon, glyphSize, 1);
        expect(anchor).toEqual(
            {x: 1.8053282193580078, y: 4.267725918069111, z: 0.0, angle: 0.9670469933974603, segment: 1}
        );
    });

    test('getCenterAnchor with center outside tile bounds', () => {
        const line = [new Point(-10, -10), new Point(5, 5)];
        const anchor = getCenterAnchor(line, 2, Math.PI, shapedText, shapedIcon, glyphSize, 1);
        expect(anchor).toEqual({x: -2.5, y: -2.5, z: 0.0, angle: 0.7853981633974483, segment: 0});
    });

    test('getCenterAnchor failing maxAngle test', () => {
        const line = [new Point(1, 1), new Point(1, 3), new Point(3, 3)];
        const anchor = getCenterAnchor(line, Math.PI / 4, shapedText, shapedIcon, glyphSize, 1);
        expect(anchor).toBeFalsy();
    });

    test('getStartAnchor', () => {
        const line = [new Point(1, 1), new Point(1, 3), new Point(3, 6), new Point(4, 7)];
        const anchor = getStartAnchor(line, Math.PI, shapedText, shapedIcon, glyphSize, 1);
        expect(anchor).toEqual(
            {x: 1, y: 1, z: 0.0, angle: -1.5707963267948966, segment: 0}
        );
    });

    test('getEndAnchor', () => {
        const line = [new Point(1, 1), new Point(1, 3), new Point(3, 6), new Point(4, 7)];
        const anchor = getEndAnchor(line, Math.PI, shapedText, shapedIcon, glyphSize, 1);
        expect(anchor).toEqual(
            {x: 4, y: 7, z: 0.0, angle: 0.7853981633974483, segment: 2}
        );
    });

    test('getStartAnchor and getEndAnchor on a single segment line', () => {
        const line = [new Point(0, 0), new Point(10, 0)];
        // Both anchors lie on the only segment and their angles point away from the line
        expect(getStartAnchor(line, Math.PI, shapedText, shapedIcon, glyphSize, 1)).toEqual(
            {x: 0, y: 0, z: 0.0, angle: Math.PI, segment: 0}
        );
        expect(getEndAnchor(line, Math.PI, shapedText, shapedIcon, glyphSize, 1)).toEqual(
            {x: 10, y: 0, z: 0.0, angle: 0, segment: 0}
        );
    });

    test('getStartAnchor and getEndAnchor with fewer than two points', () => {
        expect(getStartAnchor([], Math.PI, shapedText, shapedIcon, glyphSize, 1)).toBeFalsy();
        expect(getStartAnchor([new Point(1, 1)], Math.PI, shapedText, shapedIcon, glyphSize, 1)).toBeFalsy();
        expect(getEndAnchor([], Math.PI, shapedText, shapedIcon, glyphSize, 1)).toBeFalsy();
        expect(getEndAnchor([new Point(1, 1)], Math.PI, shapedText, shapedIcon, glyphSize, 1)).toBeFalsy();
    });

    test('getStartAnchor and getEndAnchor are not limited by label length or maxAngle', () => {
        // The label is much longer than the line and maxAngle is zero, which makes getCenterAnchor reject the line
        const line = [new Point(1, 1), new Point(1, 3), new Point(3, 3)];
        const longText = {left: -100, right: 100, top: -0.5, bottom: 0.5};
        expect(getCenterAnchor(line, 0, longText, shapedIcon, glyphSize, 1)).toBeFalsy();
        expect(getStartAnchor(line, 0, longText, shapedIcon, glyphSize, 1)).toEqual(
            {x: 1, y: 1, z: 0.0, angle: -1.5707963267948966, segment: 0}
        );
        expect(getEndAnchor(line, 0, longText, shapedIcon, glyphSize, 1)).toEqual(
            {x: 3, y: 3, z: 0.0, angle: 0, segment: 1}
        );
    });
});
