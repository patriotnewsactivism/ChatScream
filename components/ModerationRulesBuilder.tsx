import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { updateModerationRules } from '../store/chatSlice';

const ModerationRulesBuilder: React.FC = () => {
  const dispatch = useDispatch();
  const [wordList, setWordList] = useState<string>('');
  const [sensitivityThreshold, setSensitivityThreshold] = useState<number>(0.5);
  const [categoryWeights, setCategoryWeights] = useState<{ [key: string]: number }>({});

  const handleSave = () => {
    const rules = {
      wordList: wordList.split(',').map(word => word.trim()),
      sensitivityThreshold,
      categoryWeights,
    };
    dispatch(updateModerationRules(rules));
  };

  return (
    <div className="moderation-rules-builder">
      <h2>Moderation Rules Builder</h2>
      <div className="form-group">
        <label htmlFor="word-list">Word List (comma-separated):</label>
        <input id="word-list" type="text" value={wordList} onChange={(e) => setWordList(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="sensitivity-threshold">Sensitivity Threshold:</label>
        <input id="sensitivity-threshold" type="number" step="0.1" value={sensitivityThreshold} onChange={(e) => setSensitivityThreshold(Number(e.target.value))} />
      </div>
      <div className="form-group">
        <label htmlFor="category-weights">Category Weights:</label>
        <input id="category-weights" type="text" value={JSON.stringify(categoryWeights)} onChange={(e) => setCategoryWeights(JSON.parse(e.target.value))} />
      </div>
      <button onClick={handleSave} aria-label="Save moderation rules">Save</button>
    </div>
  );
};

export default ModerationRulesBuilder;