#!/usr/bin/env python3
"""
ML Training Pipeline for Hydropower Fraud Detection
Trains Isolation Forest model on synthetic data
"""

import json
import pickle
import hashlib
from pathlib import Path
from datetime import datetime
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

class FraudDetectionTrainer:
    def __init__(self, data_path, model_path):
        self.data_path = Path(data_path)
        self.model_path = Path(model_path)
        self.model = None
        self.metrics = {}
        
    def load_data(self):
        """Load and validate training data"""
        print(f"\n📂 Loading data from: {self.data_path}")
        
        with open(self.data_path, 'r') as f:
            dataset = json.load(f)
        
        metadata = dataset.get('metadata', {})
        data = dataset.get('data', [])
        
        print(f"📊 Dataset: {metadata.get('version', 'unknown')}")
        print(f"Total samples: {len(data)}")
        print(f"Fraud rate: {metadata.get('fraud_rate', 'unknown')}")
        
        # Verify data integrity
        data_str = json.dumps(data)
        calculated_hash = hashlib.sha256(data_str.encode()).hexdigest()
        expected_hash = metadata.get('sha256', '')
        
        if calculated_hash == expected_hash:
            print(f"SHA256: {calculated_hash[:16]}... ✅")
        else:
            print(f"⚠️  SHA256 mismatch!")
        
        return data
    
    def extract_features(self, data):
        """Extract features and labels"""
        X = []
        y = []
        
        for reading in data:
            # ✅ UPDATED: 6 features aligned with predict.py
            features = [
                reading['flowRate'],              # Maps to waterFlow in predict.py
                reading['generatedKwh'],          # Maps to powerOutput in predict.py
                reading['efficiency'],            # efficiency
                reading['temperature'],           # temperature
                reading.get('pressure', 90.0),    # pressure (default if missing)
                reading.get('vibration', 2.0)     # vibration (default if missing)
            ]
            X.append(features)
            y.append(1 if reading['isFraud'] else 0)  # 1 = fraud, 0 = normal
        
        return np.array(X), np.array(y)
    
    def train(self, X, y):
        """Train Isolation Forest model"""
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y
        )
        
        print(f"\nTraining set: {len(X_train)} samples")
        print(f"Test set: {len(X_test)} samples")
        
        # Train model
        print(f"\n🔧 Training Isolation Forest...")
        contamination_rate = y_train.sum() / len(y_train)
        print(f"Contamination rate: {contamination_rate:.1f}")
        
        self.model = IsolationForest(
            contamination=contamination_rate,
            n_estimators=100,
            max_samples=256,
            random_state=42,
            n_jobs=-1
        )
        
        self.model.fit(X_train)
        print("✅ Training complete")
        
        # Evaluate
        y_pred = self.model.predict(X_test)
        y_pred = np.where(y_pred == -1, 1, 0)  # Convert -1/1 to 1/0
        
        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, zero_division=0)
        recall = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        
        # False Positive Rate
        tn = ((y_test == 0) & (y_pred == 0)).sum()
        fp = ((y_test == 0) & (y_pred == 1)).sum()
        fpr = fp / (fp + tn) if (fp + tn) > 0 else 0
        
        self.metrics = {
            'accuracy': float(accuracy),
            'precision': float(precision),
            'recall': float(recall),
            'f1_score': float(f1),
            'false_positive_rate': float(fpr),
            'trained_at': datetime.utcnow().isoformat(),
            'model_type': 'IsolationForest',
            'features': ['flowRate', 'generatedKwh', 'efficiency', 'temperature', 'pressure', 'vibration'],
            'n_features': 6,
            'training_samples': len(X_train),
            'test_samples': len(X_test)
        }
        
        print(f"\n📈 Model Performance:")
        print(f"Accuracy:  {accuracy*100:.1f}%")
        print(f"Precision: {precision*100:.1f}%")
        print(f"Recall:    {recall*100:.1f}%")
        print(f"F1-Score:  {f1*100:.1f}%")
        print(f"FPR:       {fpr*100:.1f}%")
        
        return self.metrics
    
    def save_model(self):
        """Save trained model and metrics"""
        # Save model
        self.model_path.parent.mkdir(parents=True, exist_ok=True)
        
        model_file = self.model_path
        with open(model_file, 'wb') as f:
            pickle.dump(self.model, f)
        print(f"\n💾 Model saved to: {model_file}")
        
        # Save metrics
        metrics_file = self.model_path.parent / 'model_metrics.json'
        with open(metrics_file, 'w') as f:
            json.dump(self.metrics, f, indent=2)
        print(f"📊 Metrics saved to: {metrics_file}")
        
        return str(model_file)

def main():
    # Paths
    base_dir = Path(__file__).parent.parent
    data_path = base_dir / 'data' / 'training_v0.1.0.json'
    model_path = base_dir / 'models' / 'isolation_forest_v0.1.pkl'
    
    # Train
    trainer = FraudDetectionTrainer(data_path, model_path)
    data = trainer.load_data()
    X, y = trainer.extract_features(data)
    metrics = trainer.train(X, y)
    model_file = trainer.save_model()
    
    print(f"\n✅ Training pipeline complete!")
    print(f"\nTo verify reproducibility:")
    print(f"  sha256sum {model_file}")

if __name__ == '__main__':
    main()

