import React, { useEffect, useState } from 'react';
import { captionService } from '../../services/captionService';

const LiveCaptions = () => {
  const [captions, setCaptions] = useState([]);

  useEffect(() => {
    const fetchCaptions = async () => {
      const newCaptions = await captionService.getLiveCaptions();
      setCaptions(newCaptions);
    };

    fetchCaptions();
  }, []);

  return (
    <div className='live-captions'>
      {captions.map((caption, index) => (
        <p key={index} aria-live='polite' aria-atomic='true'>{caption}</p>
      ))}
    </div>
  );
};

export default LiveCaptions;