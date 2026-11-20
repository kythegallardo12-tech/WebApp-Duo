import Dialog from './Dialog';

/** Centred dialog for short decisions: confirmations and destructive actions. */
const widths = { sm: '25rem', md: '30rem', lg: '40rem' };

const Modal = ({ size = 'md', ...props }) => <Dialog variant="modal" width={widths[size] || widths.md} {...props} />;

export default Modal;
