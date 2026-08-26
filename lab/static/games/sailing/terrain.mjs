function tileIsLand(world, tileX, tileY) {
  if (tileX < 0 || tileY < 0 || tileX >= world.width || tileY >= world.height) return false;
  return world.map[tileY][tileX] === "#";
}

export function buildTerrainCells(world, detail = 4) {
  if (!Number.isInteger(detail) || detail < 2 || detail > 8) {
    throw new Error("Terrain detail must be an integer from 2 to 8");
  }

  const width = world.width * detail;
  const height = world.height * detail;
  const solid = Array.from({ length: height }, () => Array(width).fill(false));

  for (let cellY = 0; cellY < height; cellY += 1) {
    for (let cellX = 0; cellX < width; cellX += 1) {
      const tileX = Math.floor(cellX / detail);
      const tileY = Math.floor(cellY / detail);
      if (!tileIsLand(world, tileX, tileY)) continue;

      const localX = cellX % detail;
      const localY = cellY % detail;
      const north = tileIsLand(world, tileX, tileY - 1);
      const south = tileIsLand(world, tileX, tileY + 1);
      const west = tileIsLand(world, tileX - 1, tileY);
      const east = tileIsLand(world, tileX + 1, tileY);

      let keep = true;
      if (!north && localY === 0) keep = false;
      if (!south && localY === detail - 1) keep = false;
      if (!west && localX === 0) keep = false;
      if (!east && localX === detail - 1) keep = false;

      if (!north && !west && localX + localY < detail) keep = false;
      if (!north && !east && detail - 1 - localX + localY < detail) keep = false;
      if (!south && !west && localX + detail - 1 - localY < detail) keep = false;
      if (!south && !east && detail - 1 - localX + detail - 1 - localY < detail) keep = false;

      solid[cellY][cellX] = keep;
    }
  }

  return solid.map((row, cellY) => row.map((isLand, cellX) => {
    if (!isLand) return ".";
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        if (!solid[cellY + dy]?.[cellX + dx]) return "s";
      }
    }
    return "g";
  }).join(""));
}
