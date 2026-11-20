import Dialog from './Dialog';

/** Side sheet for forms and record details. Slides in from the right and back out the same way. */
const Sheet = ({ width = '32rem', ...props }) => <Dialog variant="sheet" width={width} {...props} />;

export default Sheet;
