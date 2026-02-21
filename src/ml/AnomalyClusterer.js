'use strict';

/**
 * Anomaly Clusterer - K-means for Pattern Recognition
 * ─────────────────────────────────────────────────────────────────
 * Groups similar anomalies to identify root causes
 */

class AnomalyClusterer {
  constructor(options = {}) {
    this.k = options.k || 4; // Number of clusters
    this.maxIterations = options.maxIterations || 100;
    this.tolerance = options.tolerance || 0.001;
    
    this.centroids = [];
    this.clusterNames = [];
    this.trained = false;
  }

  /**
   * Train K-means on anomaly feature vectors
   * @param {Array} anomalies - Array of { features, label (optional) }
   */
  fit(anomalies) {
    if (!anomalies || anomalies.length < this.k) {
      throw new Error(`Need at least ${this.k} anomalies to cluster`);
    }

    // Extract feature vectors
    const vectors = anomalies.map(a => a.features || a.featureVector);
    const dim = vectors[0].length;

    // Initialize centroids randomly
    this.centroids = [];
    for (let i = 0; i < this.k; i++) {
      const randomIdx = Math.floor(Math.random() * vectors.length);
      this.centroids.push([...vectors[randomIdx]]);
    }

    let converged = false;
    let iteration = 0;

    while (!converged && iteration < this.maxIterations) {
      // Assign points to nearest centroid
      const clusters = Array.from({ length: this.k }, () => []);

      for (let i = 0; i < vectors.length; i++) {
        const nearest = this._nearestCentroid(vectors[i]);
        clusters[nearest].push(i);
      }

      // Update centroids
      const oldCentroids = this.centroids.map(c => [...c]);

      for (let j = 0; j < this.k; j++) {
        if (clusters[j].length === 0) continue;

        const newCentroid = new Array(dim).fill(0);
        for (const idx of clusters[j]) {
          for (let d = 0; d < dim; d++) {
            newCentroid[d] += vectors[idx][d];
          }
        }
        for (let d = 0; d < dim; d++) {
          newCentroid[d] /= clusters[j].length;
        }
        this.centroids[j] = newCentroid;
      }

      // Check convergence
      converged = this._checkConvergence(oldCentroids, this.centroids);
      iteration++;
    }

    // Auto-name clusters based on patterns
    this.clusterNames = this._nameClustersByPatterns(anomalies, vectors);
    this.trained = true;

    console.log(`[AnomalyClusterer] Trained in ${iteration} iterations`);
    console.log('[AnomalyClusterer] Cluster names:', this.clusterNames);
  }

  /**
   * Classify new anomaly into cluster
   */
  classify(anomaly) {
    if (!this.trained) {
      throw new Error('Model not trained');
    }

    const vector = anomaly.features || anomaly.featureVector;
    const clusterId = this._nearestCentroid(vector);
    const distance = this._distance(vector, this.centroids[clusterId]);

    // Confidence based on distance to centroid
    const maxDist = Math.sqrt(vector.length); // Max possible distance in unit hypercube
    const confidence = Math.max(0, 1 - distance / maxDist);

    return {
      clusterId,
      clusterName: this.clusterNames[clusterId],
      confidence: parseFloat(confidence.toFixed(4)),
      distance: parseFloat(distance.toFixed(4))
    };
  }

  /**
   * Get cluster statistics
   */
  getClusterStats(anomalies) {
    if (!this.trained) return null;

    const stats = [];
    const vectors = anomalies.map(a => a.features || a.featureVector);

    for (let k = 0; k < this.k; k++) {
      const members = vectors.filter((v, i) => this._nearestCentroid(v) === k);
      
      stats.push({
        clusterId: k,
        clusterName: this.clusterNames[k],
        size: members.length,
        percentage: parseFloat(((members.length / vectors.length) * 100).toFixed(1)),
        centroid: this.centroids[k].map(v => parseFloat(v.toFixed(4)))
      });
    }

    return stats;
  }

  /**
   * Find nearest centroid for a vector
   */
  _nearestCentroid(vector) {
    let minDist = Infinity;
    let nearest = 0;

    for (let i = 0; i < this.centroids.length; i++) {
      const dist = this._distance(vector, this.centroids[i]);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }

    return nearest;
  }

  /**
   * Euclidean distance
   */
  _distance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * Check if centroids have converged
   */
  _checkConvergence(old, curr) {
    for (let i = 0; i < old.length; i++) {
      const dist = this._distance(old[i], curr[i]);
      if (dist > this.tolerance) return false;
    }
    return true;
  }

  /**
   * Auto-name clusters based on dominant patterns
   */
  _nameClustersByPatterns(anomalies, vectors) {
    const names = [];
    const featureNames = [
      'flowRate', 'headHeight', 'generatedKwh', 'pH',
      'turbidity', 'temperature', 'powerDensity', 'efficiencyRatio'
    ];

    for (let k = 0; k < this.k; k++) {
      const centroid = this.centroids[k];
      
      // Find dominant feature (highest value)
      let maxVal = -1;
      let maxIdx = 0;
      for (let i = 0; i < centroid.length; i++) {
        if (centroid[i] > maxVal) {
          maxVal = centroid[i];
          maxIdx = i;
        }
      }

      // Heuristic naming based on patterns
      if (maxIdx === 7 && maxVal > 0.7) {
        names.push('fraud_high_efficiency');
      } else if (maxIdx === 2 && maxVal > 0.6) {
        names.push('generation_spike');
      } else if (maxIdx === 3 || maxIdx === 4) {
        names.push('environmental_anomaly');
      } else if (maxIdx === 6) {
        names.push('power_density_outlier');
      } else {
        names.push(`cluster_${k}`);
      }
    }

    return names;
  }

  /**
   * Export model
   */
  toJSON() {
    return {
      k: this.k,
      centroids: this.centroids,
      clusterNames: this.clusterNames,
      trained: this.trained
    };
  }

  /**
   * Load model
   */
  static fromJSON(json) {
    const model = new AnomalyClusterer({ k: json.k });
    model.centroids = json.centroids;
    model.clusterNames = json.clusterNames;
    model.trained = json.trained;
    return model;
  }
}

module.exports = { AnomalyClusterer };
