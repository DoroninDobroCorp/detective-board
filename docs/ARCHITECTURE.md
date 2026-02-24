# Architecture

## Board Engine

The detective board uses a canvas-based rendering engine.

## Node System

Nodes are the primary building blocks. Each node has:
- Position (x, y)
- Content (text, image, link)
- Connections to other nodes

## State Management

All state is managed through a central store with undo/redo support.