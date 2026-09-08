#!/usr/bin/env python3
"""Analyze GLB model files to extract bone/armature structure."""

import struct
import json
import sys
from pathlib import Path

def extract_glb_info(filepath):
    """Extract JSON metadata from GLB file."""
    try:
        with open(filepath, 'rb') as f:
            magic = f.read(4)
            if magic != b'glTF':
                return {'error': 'Not a valid GLB file'}
            
            version = struct.unpack('<I', f.read(4))[0]
            length = struct.unpack('<I', f.read(4))[0]
            chunk_length = struct.unpack('<I', f.read(4))[0]
            chunk_type = f.read(4)
            
            if chunk_type == b'JSON':
                json_data = f.read(chunk_length).decode('utf-8')
                return json.loads(json_data)
    except Exception as e:
        return {'error': str(e)}

def analyze_model(filepath):
    """Analyze model structure and print bone information."""
    print(f"\n{'='*60}")
    print(f"Analyzing: {filepath}")
    print(f"{'='*60}")
    
    data = extract_glb_info(filepath)
    
    if 'error' in data:
        print(f"ERROR: {data['error']}")
        return
    
    # Print nodes with bone-related names
    if 'nodes' in data:
        print(f"\nTotal nodes: {len(data['nodes'])}")
        nodes = data['nodes']
        
        bone_keywords = ['armature', 'skeleton', 'rig', 'bone', 'jaw', 'mouth', 
                        'lip', 'hand', 'finger', 'arm', 'wrist', 'head', 'neck',
                        'shoulder', 'elbow', 'spine', 'eye', 'eyelid', 'brow']
        
        print("\nRelevant Bones/Nodes:")
        bone_nodes = []
        for i, node in enumerate(nodes):
            if 'name' in node:
                name = node['name']
                name_lower = name.lower()
                if any(keyword in name_lower for keyword in bone_keywords):
                    bone_nodes.append((i, name))
                    print(f"  [{i:3d}] {name}")
        
        print("\n  All nodes (complete list):")
        for i, node in enumerate(nodes):
            if 'name' in node:
                print(f"  [{i:3d}] {node['name']}")
    
    # Check for animations
    if 'animations' in data:
        print(f"\nAnimations: {len(data['animations'])}")
        for i, anim in enumerate(data['animations']):
            if 'name' in anim:
                print(f"  [{i}] {anim['name']}")
    
    # Check for skins (rigging)
    if 'skins' in data:
        print(f"\nSkins (Rigs): {len(data['skins'])}")
        for i, skin in enumerate(data['skins']):
            if 'name' in skin:
                print(f"  [{i}] {skin['name']}")
            if 'joints' in skin:
                print(f"      Joints: {len(skin['joints'])}")
    
    # Print materials
    if 'materials' in data:
        print(f"\nMaterials: {len(data['materials'])}")
        for i, mat in enumerate(data['materials'][:10]):
            if 'name' in mat:
                print(f"  [{i}] {mat['name']}")

# Analyze all three models
models = [
    'web/public/models/hiring_manager.glb',
    'web/public/models/product_manager.glb',
    'web/public/models/technical_interviewer.glb'
]

for model in models:
    if Path(model).exists():
        analyze_model(model)
    else:
        print(f"File not found: {model}")

print(f"\n{'='*60}\n")
