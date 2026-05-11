export interface SceneCameraVector {
  x: number;
  y: number;
  z: number;
}

export interface SceneCamera {
  eye: SceneCameraVector;
  up?: SceneCameraVector;
  center?: SceneCameraVector;
  projection?: {
    type?: string;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeVector(value: unknown): SceneCameraVector | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.z)
  ) {
    return null;
  }

  return {
    x: candidate.x,
    y: candidate.y,
    z: candidate.z,
  };
}

function buildOptionalVector(
  relayoutData: Record<string, unknown>,
  prefix: "scene.camera.up" | "scene.camera.center"
): SceneCameraVector | undefined {
  const vector = normalizeVector(relayoutData[prefix]);
  if (vector) return vector;

  const x = relayoutData[`${prefix}.x`];
  const y = relayoutData[`${prefix}.y`];
  const z = relayoutData[`${prefix}.z`];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return undefined;
  }

  return { x, y, z };
}

export function cloneSceneCamera(camera: SceneCamera): SceneCamera {
  return {
    eye: { ...camera.eye },
    up: camera.up ? { ...camera.up } : undefined,
    center: camera.center ? { ...camera.center } : undefined,
    projection: camera.projection ? { ...camera.projection } : undefined,
  };
}

export function areSceneCamerasEqual(left: SceneCamera, right: SceneCamera): boolean {
  const vectorsEqual = (
    first?: SceneCameraVector,
    second?: SceneCameraVector
  ): boolean =>
    first === second ||
    (!!first &&
      !!second &&
      first.x === second.x &&
      first.y === second.y &&
      first.z === second.z) ||
    (!first && !second);

  return (
    vectorsEqual(left.eye, right.eye) &&
    vectorsEqual(left.up, right.up) &&
    vectorsEqual(left.center, right.center) &&
    (left.projection?.type ?? undefined) === (right.projection?.type ?? undefined)
  );
}

export function extractSceneCamera(relayoutData: unknown): SceneCamera | null {
  if (!relayoutData || typeof relayoutData !== "object") return null;

  const record = relayoutData as Record<string, unknown>;
  const directCamera = record["scene.camera"];

  if (directCamera && typeof directCamera === "object") {
    const candidate = directCamera as Record<string, unknown>;
    const eye = normalizeVector(candidate.eye);
    if (!eye) return null;

    const up = normalizeVector(candidate.up) ?? undefined;
    const center = normalizeVector(candidate.center) ?? undefined;
    const projectionCandidate =
      candidate.projection && typeof candidate.projection === "object"
        ? (candidate.projection as Record<string, unknown>)
        : null;
    const projection =
      projectionCandidate
        ? {
            type:
              typeof projectionCandidate.type === "string"
                ? projectionCandidate.type
                : undefined,
          }
        : undefined;

    return { eye, up, center, projection };
  }

  const eyeX = record["scene.camera.eye.x"];
  const eyeY = record["scene.camera.eye.y"];
  const eyeZ = record["scene.camera.eye.z"];
  if (!isFiniteNumber(eyeX) || !isFiniteNumber(eyeY) || !isFiniteNumber(eyeZ)) {
    return null;
  }

  const projectionType =
    typeof record["scene.camera.projection.type"] === "string"
      ? record["scene.camera.projection.type"]
      : undefined;

  return {
    eye: { x: eyeX, y: eyeY, z: eyeZ },
    up: buildOptionalVector(record, "scene.camera.up"),
    center: buildOptionalVector(record, "scene.camera.center"),
    projection: projectionType ? { type: projectionType } : undefined,
  };
}
